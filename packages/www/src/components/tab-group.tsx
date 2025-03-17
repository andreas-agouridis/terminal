import { createSignal, type Component, For } from 'solid-js'
import { Tabs as KTabs } from '@kobalte/core'
import Code from './code';

type TabItem = {
  label: string
  value: string
  content: string
}

export type TabGroupProps = {
  tabs: TabItem[]
  defaultValue?: string
}

const TabGroup: Component<TabGroupProps> = (props) => {
  const [activeTab, setActiveTab] = createSignal<string>(
    props.defaultValue || (props.tabs.length > 0 ? props.tabs[0].value : '')
  )

  // Each tab needs a unique ID to avoid conflicts between multiple TabGroups
  const tabGroupId = Math.random().toString(36).substring(2, 10);

  return (
    <KTabs.Root
      value={activeTab()}
      onChange={setActiveTab}
      class="overflow-hidden"
    >
      <KTabs.List class="flex gap-4">
        <For each={props.tabs}>
          {(tab) => (
            <KTabs.Trigger
              value={tab.value}
              class="px-3 py-1 text-gray-11 hover:text-white lowercase transition-colors"
              classList={{
                'border-b-2': true,
                'text-white border-orange': activeTab() === tab.value,
                'border-transparent': activeTab() !== tab.value,
              }}
              id={`${tabGroupId}-tab-${tab.value}`}
            >
              {tab.label.toLowerCase()}
            </KTabs.Trigger>
          )}
        </For>
      </KTabs.List>
      <For each={props.tabs}>
        {(tab) => (
          <KTabs.Content value={tab.value} class="">
            <Code code={tab.content} language={tab.value === 'schema' ? 'json' : tab.value.toLowerCase()} />
          </KTabs.Content>
        )}
      </For>
    </KTabs.Root>
  )
}

export default TabGroup
