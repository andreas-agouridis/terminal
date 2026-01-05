package tui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	terminal "github.com/terminaldotshop/terminal-sdk-go"
)

type subscriptionsState struct {
	selected int
	deleting *int
	viewing  bool // when true, viewing a single subscription in detail
	yOffset  int  // saved scroll offset for list view
}

// default footer commands for subscription list view
var subscriptionCommands = []footerCommand{
	{key: "↑/↓", value: "navigate"},
	{key: "enter", value: "view details"},
	{key: "x/del", value: "cancel"},
	{key: "esc", value: "back"},
}

// footer commands for subscription detail view
var subscriptionDetailCommands = []footerCommand{
	{key: "x/del", value: "cancel subscription"},
	{key: "esc", value: "back to subscriptions"},
}

func (m model) SubscriptionManageSwitch(id string) (model, tea.Cmd) {
	m = m.SwitchPage(accountPage)
	m.state.footer.commands = []footerCommand{
		{key: "↑/↓", value: "navigate"},
		{key: "x/del", value: "cancel"},
		{key: "esc", value: "back"},
	}
	for i, page := range m.accountPages {
		if page == subscriptionsPage {
			m.state.account.selected = i
			break
		}
	}
	m.state.account.focused = true

	for i, sub := range m.subscriptions {
		if sub.ID == id {
			m.state.subscriptions.selected = i
			break
		}
	}

	m.state.subscriptions.deleting = nil
	m.state.subscriptions.viewing = true
	m.state.subscriptions.yOffset = m.state.account.detailViewport.YOffset
	m = m.updateAccountViewports()
	m.state.account.detailViewport.GotoTop()
	m.state.account.detailViewport.KeyMap = viewport.DefaultKeyMap()
	m.state.footer.commands = subscriptionDetailCommands
	return m, nil
}

func (m model) nextSubscription() (model, tea.Cmd) {
	next := m.state.subscriptions.selected + 1
	max := len(m.subscriptions) - 1
	if next > max {
		next = max
	}

	m.state.subscriptions.selected = next
	return m, nil
}

func (m model) previousSubscription() (model, tea.Cmd) {
	next := max(m.state.subscriptions.selected-1, 0)
	m.state.subscriptions.selected = next
	return m, nil
}

func (m model) SubscriptionsUpdate(msg tea.Msg) (model, tea.Cmd) {
	// Handle detail view
	if m.state.subscriptions.viewing {
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.String() {
			case "n", "esc":
				// If deletion is pending, cancel it
				if m.state.subscriptions.deleting != nil {
					m.state.subscriptions.deleting = nil
					return m, nil
				}
				// Otherwise exit detail view
				m.state.footer.commands = subscriptionCommands
				m.state.subscriptions.viewing = false
				return m, nil
			case "q", "backspace":
				// Exit detail view (but don't cancel deletion with these)
				if m.state.subscriptions.deleting == nil {
					m.state.footer.commands = subscriptionCommands
					m.state.subscriptions.viewing = false
				}
				return m, nil
			case "delete", "d", "x":
				if m.state.subscriptions.deleting == nil && len(m.subscriptions) > 0 {
					m.state.subscriptions.deleting = &m.state.subscriptions.selected
				}
				return m, nil
			case "y":
				if m.state.subscriptions.deleting != nil {
					m.state.subscriptions.deleting = nil
					_, err := m.client.Subscription.Delete(m.context, m.subscriptions[m.state.subscriptions.selected].ID)
					if err != nil {
						return m, func() tea.Msg { return err }
					}
					// Exit detail view and go back to list
					m.state.subscriptions.viewing = false
					m.state.footer.commands = subscriptionCommands
					if len(m.subscriptions)-1 == 0 {
						m.state.account.focused = false
					}
					return m, func() tea.Msg {
						subscriptions, err := m.client.Subscription.List(m.context)
						if err != nil {
							return err
						}
						return subscriptions.Data
					}
				}
				return m, nil
			}
			// Pass other keys to viewport for scrolling
			var cmd tea.Cmd
			m.state.account.detailViewport.KeyMap = viewport.DefaultKeyMap()
			m.state.account.detailViewport, cmd = m.state.account.detailViewport.Update(msg)
			return m, cmd
		}
		return m, nil
	}

	// List view: show default subscription commands
	m.state.footer.commands = subscriptionCommands

	var cmds []tea.Cmd
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "j", "down", "tab":
			if m.state.subscriptions.deleting == nil {
				return m.nextSubscription()
			}
		case "k", "up", "shift+tab":
			if m.state.subscriptions.deleting == nil {
				return m.previousSubscription()
			}
		case "enter":
			if m.state.subscriptions.deleting == nil && len(m.subscriptions) > 0 {
				m.state.subscriptions.viewing = true
				m.state.subscriptions.yOffset = m.state.account.detailViewport.YOffset
				m.state.account.detailViewport.GotoTop()
				m.state.footer.commands = subscriptionDetailCommands
			}
			return m, nil
		case "delete", "d", "x":
			if m.state.subscriptions.deleting == nil {
				m.state.subscriptions.deleting = &m.state.subscriptions.selected
			}
			return m, nil
		case "y":
			if m.state.subscriptions.deleting != nil {
				m.state.subscriptions.deleting = nil
				_, err := m.client.Subscription.Delete(m.context, m.subscriptions[m.state.subscriptions.selected].ID)
				if err != nil {
					return m, func() tea.Msg { return err }
				}
				if len(m.subscriptions)-1 == 0 {
					m.state.account.focused = false
				}
				return m, func() tea.Msg {
					subscriptions, err := m.client.Subscription.List(m.context)
					if err != nil {
						return err
					}
					return subscriptions.Data
				}
			}
			return m, nil
		case "n", "esc":
			m.state.subscriptions.deleting = nil
			return m, nil
		}
	}
	return m, tea.Batch(cmds...)
}

func (m model) formatSubscription(subscription terminal.Subscription, totalWidth int) string {
	base := m.theme.Base().Render
	accent := m.theme.TextAccent().Render

	var product *terminal.Product
	for _, p := range m.products {
		for _, v := range p.Variants {
			if v.ID == subscription.ProductVariantID {
				product = &p
			}
		}
	}

	if product == nil {
		return base("unknown product")
	}

	title := accent(fmt.Sprintf("%dx %s", subscription.Quantity, product.Name))
	if product.Name == "cron" {
		title = accent(product.Name)
	} else {
		scheduleType := ""
		if subscription.Schedule.Type == "weekly" {
			scheduleType = "weeks"
		}
		title = accent(title) + base(fmt.Sprintf(" (every %d %s)", subscription.Schedule.Interval, scheduleType))
	}

	price := fmt.Sprintf(" $%2v", subscription.Quantity*subscription.Price/100)
	space := totalWidth - lipgloss.Width(
		title,
	) - lipgloss.Width(price) - 2
	content := lipgloss.JoinHorizontal(
		lipgloss.Top,
		title,
		m.theme.Base().Width(space).Render(),
		m.theme.Base().Render(price),
	)

	lines := []string{}
	lines = append(lines, content)
	lines = append(lines, fmt.Sprintf("next shipment: %s", subscription.Next))

	return lipgloss.JoinVertical(lipgloss.Left, lines...)
}

// formatSubscriptionDetail renders the detailed view of a single subscription
func (m model) formatSubscriptionDetail(subscription terminal.Subscription) string {
	base := m.theme.Base().Render
	accent := m.theme.TextAccent().Render
	highlight := m.theme.TextBrand().Render

	lines := []string{}
	lines = append(lines, base("< ")+accent("esc ")+base("back to subscriptions\n"))

	// Subscription header
	header := fmt.Sprintf("subscription %s", subscription.ID)
	lines = append(lines, highlight(header))
	lines = append(lines, base("created: ")+base(subscription.Created))
	lines = append(lines, "")

	// Address details
	var addr *terminal.Address
	for _, a := range m.addresses {
		if a.ID == subscription.AddressID {
			addr = &a
			break
		}
	}
	if addr != nil {
		lines = append(lines, accent("address"))
		lines = append(lines, base(addr.Name))
		lines = append(lines, base(addr.Street1))
		if addr.Street2 != "" {
			lines = append(lines, base(addr.Street2))
		}
		cityLine := fmt.Sprintf("%s, %s %s", addr.City, addr.Province, addr.Zip)
		lines = append(lines, base(cityLine))
		lines = append(lines, base(addr.Country))
		if addr.Phone != "" {
			lines = append(lines, base(fmt.Sprintf("tel: %s", addr.Phone)))
		}
		lines = append(lines, "")
	} else {
		lines = append(lines, accent("address"), base(subscription.AddressID), "")
	}

	// Card details
	var card *terminal.Card
	for _, c := range m.cards {
		if c.ID == subscription.CardID {
			card = &c
			break
		}
	}
	if card != nil {
		lines = append(lines, accent("card"))
		lines = append(lines, base(fmt.Sprintf("%s • ****%s", card.Brand, card.Last4)))
		lines = append(lines, base(fmt.Sprintf("expires %02d/%04d", card.Expiration.Month, card.Expiration.Year)))
		lines = append(lines, "")
	} else {
		lines = append(lines, accent("card"), base(subscription.CardID), "")
	}

	// Product details
	var product *terminal.Product
	var variant *terminal.ProductVariant
	for _, p := range m.products {
		for _, v := range p.Variants {
			if v.ID == subscription.ProductVariantID {
				product = &p
				variant = &v
			}
		}
	}
	if product != nil && variant != nil {
		lines = append(lines, accent("product"))
		lines = append(lines, base(fmt.Sprintf("name: %s", product.Name)))
		lines = append(lines, base(fmt.Sprintf("variant: %s", variant.Name)))
		lines = append(lines, base(fmt.Sprintf("quantity: %d", subscription.Quantity)))
		lines = append(lines, base(fmt.Sprintf("price: $%d", subscription.Price/100)))
		lines = append(lines, base(fmt.Sprintf("subtotal: $%d", (subscription.Quantity*subscription.Price)/100)))
		lines = append(lines, "")
	}

	// Next shipment
	lines = append(lines, accent("next shipment"))
	lines = append(lines, base(subscription.Next))
	lines = append(lines, "")

	// Schedule
	lines = append(lines, accent("schedule"))
	switch subscription.Schedule.Type {
	case terminal.SubscriptionScheduleTypeFixed:
		// Fixed schedule: render as monthly
		lines = append(lines, base("monthly"))
	case terminal.SubscriptionScheduleTypeWeekly:
		// Weekly schedule: render every N weeks
		unit := "week"
		if subscription.Schedule.Interval != 1 {
			unit = "weeks"
		}
		lines = append(lines, base(fmt.Sprintf("every %d %s", subscription.Schedule.Interval, unit)))
	default:
		// Fallback: show raw type and interval
		lines = append(lines, base(fmt.Sprintf("%s every %d", subscription.Schedule.Type, subscription.Schedule.Interval)))
	}

	return lipgloss.JoinVertical(lipgloss.Left, lines...)
}

func (m model) SubscriptionsView(totalWidth int, focused bool) string {
	base := m.theme.Base().Render
	accent := m.theme.TextAccent().Render

	// If viewing detail, show the full subscription details view
	if m.state.subscriptions.viewing && len(m.subscriptions) > 0 {
		// Show confirmation dialog if deletion is pending
		if m.state.subscriptions.deleting != nil {
			content := accent("are you sure?") + base("\n(y/n)")
			return m.theme.Base().Width(totalWidth).Render(content)
		}
		sub := m.subscriptions[m.state.subscriptions.selected]
		detailContent := m.formatSubscriptionDetail(sub)
		return m.theme.Base().Width(totalWidth).Render(detailContent)
	}
	subscriptions := []string{}
	for i, subscription := range m.subscriptions {
		content := m.formatSubscription(subscription, totalWidth)
		if m.state.subscriptions.deleting != nil && *m.state.subscriptions.deleting == i {
			content = accent("are you sure?") + base("\n(y/n)")
		}
		box := m.CreateBoxCustom(
			content,
			focused && i == m.state.subscriptions.selected,
			totalWidth,
		)
		subscriptions = append(subscriptions, box)
	}

	subscriptionList := lipgloss.JoinVertical(lipgloss.Left, subscriptions...)
	if len(subscriptions) == 0 {
		return lipgloss.Place(
			totalWidth,
			m.heightContent,
			lipgloss.Center,
			lipgloss.Center,
			base("no active subscriptions"),
		)
	}

	return m.theme.Base().Render(lipgloss.JoinVertical(
		lipgloss.Left,
		subscriptionList,
	))
}
