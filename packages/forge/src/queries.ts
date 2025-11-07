import { useTransaction } from "@terminal/core/drizzle/transaction";
import { eq, desc, sql, sum, isNull, and, SQL, like, or, isNotNull } from "@terminal/core/drizzle/index";
import { orderTable, orderItemTable } from "@terminal/core/order/order.sql";
import { subscriptionTable } from "@terminal/core/subscription/subscription.sql";
import { addressTable } from "@terminal/core/address/address.sql";
import { cardTable } from "@terminal/core/card/card.sql";
import { cartTable, cartItemTable } from "@terminal/core/cart/cart.sql";
import { productTable, productVariantTable } from "@terminal/core/product/product.sql";
import { userTable } from "@terminal/core/user/user.sql";

type PaginationInput = {
  offset: number;
  pageSize: number;
};

/**
 * Get orders for a user with calculated total amount
 * Uses LEFT JOIN with GROUP BY to efficiently calculate order totals
 */
export async function getUserOrders(userID: string, pagination: PaginationInput) {
  return useTransaction(async (tx) => ({
    data: await tx
      .select({
        id: orderTable.id,
        created: orderTable.timeCreated,
        email: orderTable.email,
        amount: sql<string>`COALESCE(SUM(${orderItemTable.amount}), 0)`,
        shippingAmount: orderTable.shippingAmount,
        shippingAddress: orderTable.shippingAddress,
        trackingNumber: orderTable.trackingNumber,
        trackingURL: orderTable.trackingURL,
        trackingStatus: orderTable.trackingStatus,
        trackingStatusDetails: orderTable.trackingStatusDetails,
        trackingStatusUpdatedAt: orderTable.trackingStatusUpdatedAt,
        labelURL: orderTable.labelURL,
        fulfiller: orderTable.fulfiller,
        timePrinted: orderTable.timePrinted,
      })
      .from(orderTable)
      .leftJoin(orderItemTable, eq(orderItemTable.orderID, orderTable.id))
      .where(eq(orderTable.userID, userID))
      .groupBy(
        orderTable.id,
        orderTable.timeCreated,
        orderTable.email,
        orderTable.shippingAmount,
        orderTable.shippingAddress,
        orderTable.trackingNumber,
        orderTable.trackingURL,
        orderTable.trackingStatus,
        orderTable.trackingStatusDetails,
        orderTable.trackingStatusUpdatedAt,
        orderTable.labelURL,
        orderTable.fulfiller,
        orderTable.timePrinted,
      )
      .orderBy(desc(orderTable.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize),
  }));
}

/**
 * Get all orders with calculated total amount (for admin views)
 * Uses LEFT JOIN with GROUP BY to efficiently calculate order totals
 */
export async function getAllOrders(pagination: PaginationInput, queryTerm?: string) {
  return useTransaction(async (tx) => ({
    data: await tx
      .select({
        id: orderTable.id,
        created: orderTable.timeCreated,
        printed: orderTable.timePrinted,
        tracking: orderTable.trackingURL,
        status: orderTable.trackingStatus,
        fulfiller: orderTable.fulfiller,
        updated: orderTable.trackingStatusUpdatedAt,
        label: orderTable.labelURL,
        address: orderTable.shippingAddress,
        email: orderTable.email,
        amount: sql<string>`COALESCE(SUM(${orderItemTable.amount}), 0)`,
      })
      .from(orderTable)
      .leftJoin(orderItemTable, eq(orderItemTable.orderID, orderTable.id))
      .where(
        queryTerm
          ? or(
              sql`lower(${orderTable.shippingAddress}->>'$.name') LIKE ${"%" + queryTerm.toLowerCase().replaceAll(" ", "%") + "%"}`,
              like(orderTable.email, "%" + queryTerm + "%"),
            )
          : undefined,
      )
      .groupBy(
        orderTable.id,
        orderTable.timeCreated,
        orderTable.timePrinted,
        orderTable.trackingURL,
        orderTable.trackingStatus,
        orderTable.fulfiller,
        orderTable.trackingStatusUpdatedAt,
        orderTable.labelURL,
        orderTable.shippingAddress,
        orderTable.email,
      )
      .orderBy(desc(orderTable.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize),
  }));
}

/**
 * Get subscriptions for a user with product and address details
 */
export async function getUserSubscriptions(userID: string, pagination: PaginationInput) {
  return useTransaction(async (tx) => ({
    data: await tx
      .select({
        id: subscriptionTable.id,
        product: productTable.name,
        productVariant: productVariantTable.name,
        price: subscriptionTable.price,
        quantity: subscriptionTable.quantity,
        schedule: subscriptionTable.schedule,
        next: subscriptionTable.timeNext,
        address: addressTable.address,
        created: subscriptionTable.timeCreated,
      })
      .from(subscriptionTable)
      .innerJoin(
        productVariantTable,
        eq(subscriptionTable.productVariantID, productVariantTable.id),
      )
      .innerJoin(
        productTable,
        eq(productVariantTable.productID, productTable.id),
      )
      .innerJoin(
        addressTable,
        eq(subscriptionTable.addressID, addressTable.id),
      )
      .where(
        and(eq(subscriptionTable.userID, userID), isNull(subscriptionTable.timeDeleted)),
      )
      .orderBy(desc(subscriptionTable.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize),
  }));
}

/**
 * Get all subscriptions with optional product filter and search
 */
export async function getAllSubscriptions(
  pagination: PaginationInput,
  productFilter: SQL,
  queryTerm?: string,
) {
  return useTransaction(async (tx) => ({
    data: await tx
      .select({
        id: subscriptionTable.id,
        name: userTable.name,
        email: userTable.email,
        address: addressTable.address,
        product: productTable.name,
        price: subscriptionTable.price,
        created: subscriptionTable.timeCreated,
        schedule: subscriptionTable.schedule,
        next: subscriptionTable.timeNext,
      })
      .from(subscriptionTable)
      .innerJoin(
        userTable,
        eq(subscriptionTable.userID, userTable.id),
      )
      .innerJoin(
        addressTable,
        eq(subscriptionTable.addressID, addressTable.id),
      )
      .innerJoin(
        productVariantTable,
        eq(subscriptionTable.productVariantID, productVariantTable.id),
      )
      .innerJoin(
        productTable,
        eq(productVariantTable.productID, productTable.id),
      )
      .where(
        and(
          isNull(subscriptionTable.timeDeleted),
          productFilter,
          queryTerm
            ? or(
                like(productTable.name, "%" + queryTerm + "%"),
                like(userTable.email, "%" + queryTerm + "%"),
                like(userTable.name, "%" + queryTerm + "%"),
              )
            : sql`true`,
        ),
      )
      .orderBy(desc(subscriptionTable.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize),
  }));
}

/**
 * Get addresses for a user
 */
export async function getUserAddresses(userID: string, pagination: PaginationInput) {
  return useTransaction(async (tx) => ({
    data: await tx
      .select()
      .from(addressTable)
      .where(eq(addressTable.userID, userID))
      .orderBy(desc(addressTable.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize),
  }));
}

/**
 * Get cards for a user
 */
export async function getUserCards(userID: string, pagination: PaginationInput) {
  return useTransaction(async (tx) => ({
    data: await tx
      .select()
      .from(cardTable)
      .where(eq(cardTable.userID, userID))
      .orderBy(desc(cardTable.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize),
  }));
}

/**
 * Get cart for a user with aggregated item count and cost
 */
export async function getUserCart(userID: string, pagination: PaginationInput) {
  return useTransaction(async (tx) => ({
    data: await tx
      .select({
        cartID: cartTable.id,
        items: sum(cartItemTable.quantity),
        cost: sql`SUM(${cartItemTable.quantity} * ${productVariantTable.price})`,
        addressID: cartTable.addressID,
        cardID: cartTable.cardID,
        shippingAmount: cartTable.shippingAmount,
        shippingService: cartTable.shippingService,
      })
      .from(cartTable)
      .leftJoin(
        cartItemTable,
        eq(cartTable.userID, cartItemTable.userID),
      )
      .leftJoin(
        productVariantTable,
        eq(cartItemTable.productVariantID, productVariantTable.id),
      )
      .where(eq(cartTable.userID, userID))
      .groupBy(
        cartTable.id,
        cartTable.addressID,
        cartTable.cardID,
        cartTable.shippingAmount,
        cartTable.shippingService,
      )
      .offset(pagination.offset)
      .limit(pagination.pageSize),
  }));
}

/**
 * Get user by ID
 */
export async function getUser(userID: string) {
  return useTransaction(async (tx) =>
    tx
      .select()
      .from(userTable)
      .where(eq(userTable.id, userID))
      .limit(1)
      .then((rows) => rows[0]),
  );
}

/**
 * Get all users with optional search filter by name or email
 * @param requireNameAndEmail - If true, filters out users who don't have both a name and email (default: true)
 */
export async function getAllUsers(
  pagination: PaginationInput,
  queryTerm?: string,
  requireNameAndEmail: boolean = true,
) {
  const whereConditions: SQL[] = [];
  
  if (requireNameAndEmail) {
    whereConditions.push(isNotNull(userTable.name));
    whereConditions.push(isNotNull(userTable.email));
  }
  
  if (queryTerm) {
    whereConditions.push(
      or(
        like(userTable.name, "%" + queryTerm + "%"),
        like(userTable.email, "%" + queryTerm + "%"),
      )!,
    );
  }

  return useTransaction(async (tx) => ({
    data: await tx
      .select()
      .from(userTable)
      .where(whereConditions.length > 0 ? and(...whereConditions) : sql`true`)
      .orderBy(desc(userTable.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize),
  }));
}

