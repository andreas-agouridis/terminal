import { prefixes } from "./util/id";

export module Examples {
  export const Id = (prefix: keyof typeof prefixes) =>
    `${prefixes[prefix]}_XXXXXXXXXXXXXXXXXXXXXXXXX`;

  export const Address = {
    name: "John Doe",
    street1: "123 Main St",
    street2: "Apt 1",
    city: "Anytown",
    province: "CA",
    zip: "12345",
    country: "US",
    phone: "5555555555",
  };

  export const Shipping = {
    id: Id("userShipping"),
    ...Address,
  };

  export const Card = {
    id: Id("card"),
    brand: "Visa",
    expiration: { month: 12, year: 2023 },
    last4: "1234",
  };

  export const ProductVariant = {
    id: Id("productVariant"),
    name: "12oz",
    price: 2200,
  };

  export const Product = {
    id: Id("product"),
    name: "[object Object]",
    description:
      "The interpolation of Caturra and Castillo varietals from Las Cochitas creates this refreshing citrusy and complex coffee.",
    variants: [ProductVariant],
    order: 100,
    subscription: "allowed" as const,
    tags: { featured: true },
    filters: [],
  };

  export const CartItem = {
    id: Id("cartItem"),
    productVariantID: ProductVariant.id,
    quantity: 2,
    subtotal: 4400,
  };

  export const Cart = {
    subtotal: CartItem.subtotal,
    items: [CartItem],
    amount: {
      subtotal: CartItem.subtotal,
      shipping: 800,
    },
    addressID: Shipping.id,
    cardID: Card.id,
    shipping: {
      service: "USPS Ground Advantage",
      timeframe: "3-5 days",
    },
  };

  export const OrderItem = {
    id: CartItem.id,
    amount: CartItem.subtotal,
    quantity: CartItem.quantity,
    productVariantID: CartItem.productVariantID,
  };

  export const GiftCard = {
    id: Id("giftCard"),
    orderID: Id("order"),
    value: 3200,
    balance: 3200,
    recipientEmail: "test@example.com",
  };

  export const Order = {
    id: Id("order"),
    index: 0,
    shipping: { ...Address, id: undefined },
    amount: Cart.amount,
    tracking: {
      service: Cart.shipping.service,
      number: "92346903470167000000000019",
      url: "https://tools.usps.com/go/TrackConfirmAction_input?origTrackNum=92346903470167000000000019",
    },
    items: [OrderItem],
  };

  export const User = {
    id: Id("user"),
    name: "John Doe",
    email: "john@example.com",
    fingerprint: "183ded44-24d0-480e-9908-c022eff8d111",
    stripeCustomerID: "cus_XXXXXXXXXXXXXXXXX",
  };

  export const Profile = {
    user: User,
  };

  export const Subscription = {
    id: Id("subscription"),
    productVariantID: ProductVariant.id,
    quantity: 1,
    addressID: Shipping.id,
    cardID: Card.id,
    schedule: { type: "weekly" as const, interval: 3 },
    next: new Date("2025-02-01 19:36:19.000"),
  };

  export const Token = {
    id: Id("apiPersonal"),
    token: "trm_test_******XXXX",
    created: new Date("2024-06-29 19:36:19.000"),
  };

  export const App = {
    id: Id("apiClient"),
    secret: "sec_******XXXX",
    name: "Example App",
    redirectURI: "https://example.com/callback",
  };

  export const Collect = {
    url: "https://trm.sh/XXXXXXXXXX",
  };
}
