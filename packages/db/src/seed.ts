import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./client.js";
import {
  conversationSummaries,
  conversations,
  kbArticles,
  messages,
  orders,
  payments,
  productVariants,
  products,
  refunds,
  returns,
  shipments,
  users,
} from "./schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to the repo-root .env file.");
  process.exit(1);
}

const db = createDb(process.env.DATABASE_URL);

/** Everything is seeded relative to "now" so the demo never goes stale. */
const now = Date.now();
const days = (n: number) => new Date(now + n * 86_400_000);
const RETURN_WINDOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

interface ProductSeed {
  slug: string;
  modelName: string;
  gender: "men" | "women";
  type: "running" | "walking" | "sports" | "slip_on" | "casual" | "formal" | "trekking";
  colour: string;
  materials: string;
  care: string;
  mrp: number;
  price: number;
  fitNote: string;
  description: string;
  /** UK sizes stocked, with quantity. Zero means listed but out of stock. */
  stock: Array<[size: number, qty: number]>;
}

const CATALOGUE: ProductSeed[] = [
  {
    slug: "oxyfit-men-walking",
    modelName: "Oxyfit",
    gender: "men",
    type: "walking",
    colour: "Navy",
    materials: "Breathable mesh upper, EVA midsole, rubber outsole",
    care: "Wipe with a damp cloth. Do not machine wash — it delaminates the midsole glue.",
    mrp: 999,
    price: 704,
    fitNote: "True to size. Take your usual UK size.",
    description:
      "Lightweight everyday walking shoe with a cushioned EVA midsole and a wide, stable base.",
    // UK 8.5 is deliberately out of stock between two available sizes.
    stock: [
      [6, 4],
      [7, 9],
      [7.5, 5],
      [8, 12],
      [8.5, 0],
      [9, 7],
      [10, 3],
      [11, 2],
    ],
  },
  {
    slug: "airglide-men-running",
    modelName: "Airglide",
    gender: "men",
    type: "running",
    colour: "Grey",
    materials: "Engineered knit upper, compression-moulded EVA midsole",
    care: "Air dry only. Remove insoles before cleaning.",
    mrp: 1899,
    price: 1149,
    fitNote: "Runs about half a size small. If you are between sizes, take the larger one.",
    description:
      "Daily road trainer with a knit upper and a 8 mm drop. Built for 5–15 km runs on tarmac.",
    stock: [
      [6, 2],
      [7, 6],
      [8, 8],
      [8.5, 4],
      [9, 11],
      [9.5, 3],
      [10, 5],
      [11, 1],
    ],
  },
  {
    slug: "easyslip-men-slip-on",
    modelName: "Easyslip",
    gender: "men",
    type: "slip_on",
    colour: "Tan",
    materials: "Suede upper, elastic gore, moulded footbed",
    care: "Brush with a suede brush. Never soak — water marks suede permanently.",
    mrp: 649,
    price: 429,
    fitNote: "Snug for the first week by design; the suede relaxes to fit.",
    description: "Laceless suede slip-on with a padded collar. Everyday casual wear.",
    stock: [
      [6, 5],
      [7, 8],
      [8, 6],
      [9, 9],
      [10, 4],
      [11, 0],
    ],
  },
  {
    slug: "ridgeline-men-trekking",
    modelName: "Ridgeline",
    gender: "men",
    type: "trekking",
    colour: "Olive",
    materials: "Nubuck leather upper, TPU shank, lugged rubber outsole",
    care: "Brush off dirt, re-wax the nubuck every season. Do not dry near direct heat.",
    mrp: 3499,
    price: 2299,
    fitNote: "Roomy toe box for descents. Take your usual size, with a hiking sock.",
    description:
      "Mid-weight trekking shoe with a lugged outsole and a protective toe cap for rocky trails.",
    stock: [
      [7, 3],
      [8, 5],
      [9, 6],
      [10, 4],
      [11, 2],
      [12, 1],
    ],
  },
  {
    slug: "bolt-men-sports",
    modelName: "Bolt",
    gender: "men",
    type: "sports",
    colour: "Black",
    materials: "Mesh upper, phylon midsole",
    care: "Machine washable on a cold gentle cycle in a laundry bag.",
    mrp: 899,
    price: 549,
    fitNote: "True to size.",
    description: "Budget multi-sport trainer for gym and casual wear.",
    stock: [
      [6, 7],
      [7, 10],
      [8, 12],
      [9, 8],
      [10, 6],
      [11, 3],
    ],
  },
  {
    slug: "meridian-men-formal",
    modelName: "Meridian",
    gender: "men",
    type: "formal",
    colour: "Black",
    materials: "Full-grain leather upper, leather lining, TPR sole",
    care: "Wipe clean, then polish with a neutral cream. Never machine wash leather.",
    mrp: 2999,
    price: 1899,
    fitNote: "Built on a leather last that runs large — size down half a size.",
    description: "Derby-style formal shoe in full-grain leather, for office and occasion wear.",
    stock: [
      [6, 2],
      [7, 4],
      [8, 6],
      [9, 5],
      [10, 3],
      [11, 1],
    ],
  },
  {
    slug: "cloudwalk-women-walking",
    modelName: "Cloudwalk",
    gender: "women",
    type: "walking",
    colour: "Lilac",
    materials: "Mesh upper, memory-foam footbed",
    care: "Wipe with a damp cloth. Air dry away from sunlight.",
    mrp: 1499,
    price: 899,
    fitNote: "True to size, and forgiving across the forefoot.",
    description: "Cushioned everyday walking shoe with a memory-foam footbed.",
    stock: [
      [3, 4],
      [4, 8],
      [5, 10],
      [5.5, 5],
      [6, 7],
      [7, 3],
      [8, 2],
    ],
  },
  {
    slug: "breeze-women-running",
    modelName: "Breeze",
    gender: "women",
    type: "running",
    colour: "Coral",
    materials: "Knit upper, EVA midsole, rubber outsole",
    care: "Air dry only. Remove insoles before cleaning.",
    mrp: 2199,
    price: 1299,
    fitNote: "Narrow through the midfoot. Size up if you have a high instep.",
    description: "Lightweight women's road runner with a breathable knit upper.",
    stock: [
      [3, 2],
      [4, 6],
      [5, 9],
      [6, 7],
      [6.5, 3],
      [7, 4],
      [8, 1],
    ],
  },
];

const rupees = (n: number) => n * 100;

const ADDRESS = {
  line1: "12 Ashoka Lane, Indiranagar",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560038",
  country: "IN",
};

async function seed() {
  console.log("Clearing existing data…");
  // Child-first, so foreign keys never block a delete.
  await db.delete(conversationSummaries);
  await db.delete(messages);
  await db.delete(conversations);
  await db.delete(refunds);
  await db.delete(payments);
  await db.delete(returns);
  await db.delete(shipments);
  await db.delete(orders);
  await db.delete(productVariants);
  await db.delete(products);
  await db.delete(kbArticles);
  await db.delete(users);

  console.log("Seeding customer…");
  const [customer] = await db
    .insert(users)
    .values({ email: "suz@example.com", name: "Suz" })
    .returning();
  if (!customer) throw new Error("Failed to seed user");
  const userId = customer.id;

  console.log("Seeding catalogue…");
  const productRows = await db
    .insert(products)
    .values(
      CATALOGUE.map((p) => ({
        slug: p.slug,
        modelName: p.modelName,
        gender: p.gender,
        type: p.type,
        colour: p.colour,
        materials: p.materials,
        care: p.care,
        mrpPaise: rupees(p.mrp),
        pricePaise: rupees(p.price),
        fitNote: p.fitNote,
        description: p.description,
      })),
    )
    .returning();

  const productBySlug = new Map(productRows.map((row) => [row.slug, row]));

  await db.insert(productVariants).values(
    CATALOGUE.flatMap((p) => {
      const row = productBySlug.get(p.slug);
      if (!row) throw new Error(`Product ${p.slug} was not inserted`);
      return p.stock.map(([size, qty]) => ({
        productId: row.id,
        sizeUk: size,
        // Slug carries the size, so a variant is readable in a log or a reply.
        variantSlug: `${p.slug}-uk${size}`,
        stockQty: qty,
      }));
    }),
  );

  const priceOf = (slug: string) => {
    const p = CATALOGUE.find((c) => c.slug === slug);
    if (!p) throw new Error(`Unknown product ${slug}`);
    return rupees(p.price);
  };
  const nameOf = (slug: string) => {
    const p = CATALOGUE.find((c) => c.slug === slug);
    if (!p) throw new Error(`Unknown product ${slug}`);
    const g = p.gender === "men" ? "Men" : "Women";
    return `MaxiStep ${g} ${p.modelName}`;
  };
  const item = (slug: string, sizeUk: number) => ({
    slug,
    name: nameOf(slug),
    sizeUk,
    quantity: 1,
    unitPricePaise: priceOf(slug),
  });

  console.log("Seeding orders…");
  const orderRows = await db
    .insert(orders)
    .values([
      // Carries the in-flight exchange and the two same-day payments.
      {
        orderNumber: "ORD-1037",
        userId,
        status: "delivered" as const,
        items: [item("breeze-women-running", 5)],
        shippingAddress: ADDRESS,
        subtotalPaise: priceOf("breeze-women-running"),
        shippingPaise: 0,
        totalPaise: priceOf("breeze-women-running"),
        placedAt: days(-24),
        deliveredAt: days(-20),
        updatedAt: days(-6),
      },
      // Outside the 14-day window, inside the 6-month sole warranty.
      {
        orderNumber: "ORD-1038",
        userId,
        status: "delivered" as const,
        items: [item("ridgeline-men-trekking", 9)],
        shippingAddress: ADDRESS,
        subtotalPaise: priceOf("ridgeline-men-trekking"),
        shippingPaise: 0,
        totalPaise: priceOf("ridgeline-men-trekking"),
        placedAt: days(-99),
        deliveredAt: days(-95),
        updatedAt: days(-95),
      },
      // Already shipped: cancellation must be refused.
      {
        orderNumber: "ORD-1039",
        userId,
        status: "shipped" as const,
        items: [item("cloudwalk-women-walking", 5)],
        shippingAddress: ADDRESS,
        subtotalPaise: priceOf("cloudwalk-women-walking"),
        shippingPaise: 0,
        totalPaise: priceOf("cloudwalk-women-walking"),
        placedAt: days(-3),
        updatedAt: days(-2),
      },
      // Cancelled before dispatch; its refund is still processing.
      {
        orderNumber: "ORD-1040",
        userId,
        status: "cancelled" as const,
        items: [item("easyslip-men-slip-on", 8)],
        shippingAddress: ADDRESS,
        subtotalPaise: priceOf("easyslip-men-slip-on"),
        shippingPaise: 0,
        totalPaise: priceOf("easyslip-men-slip-on"),
        placedAt: days(-9),
        cancelledAt: days(-8),
        cancellationReason: "Ordered the wrong size",
        updatedAt: days(-8),
      },
      // Inside the window: the live exchange case.
      {
        orderNumber: "ORD-1041",
        userId,
        status: "delivered" as const,
        items: [item("airglide-men-running", 8)],
        shippingAddress: ADDRESS,
        subtotalPaise: priceOf("airglide-men-running"),
        shippingPaise: 0,
        totalPaise: priceOf("airglide-men-running"),
        placedAt: days(-9),
        deliveredAt: days(-5),
        updatedAt: days(-5),
      },
      // Live tracking case, reached through the router's heuristic tier.
      {
        orderNumber: "ORD-1042",
        userId,
        status: "out_for_delivery" as const,
        items: [item("oxyfit-men-walking", 9)],
        shippingAddress: ADDRESS,
        subtotalPaise: priceOf("oxyfit-men-walking"),
        shippingPaise: 4900,
        totalPaise: priceOf("oxyfit-men-walking") + 4900,
        placedAt: days(-4),
        updatedAt: days(0),
      },
      // Still pending: cancellation must be allowed.
      {
        orderNumber: "ORD-1043",
        userId,
        status: "pending" as const,
        items: [item("bolt-men-sports", 10)],
        shippingAddress: ADDRESS,
        subtotalPaise: priceOf("bolt-men-sports"),
        shippingPaise: 4900,
        totalPaise: priceOf("bolt-men-sports") + 4900,
        placedAt: days(-1),
        updatedAt: days(-1),
      },
    ])
    .returning();

  const orderByNumber = new Map(orderRows.map((row) => [row.orderNumber, row]));
  const orderId = (num: string) => {
    const row = orderByNumber.get(num);
    if (!row) throw new Error(`Order ${num} was not inserted`);
    return row.id;
  };

  console.log("Seeding shipments…");
  await db.insert(shipments).values([
    {
      orderId: orderId("ORD-1042"),
      carrier: "Delhivery",
      trackingNumber: "DLV4471902388",
      status: "out_for_delivery" as const,
      estimatedDelivery: days(0),
      shippedAt: days(-2),
      lastLocation: "Bengaluru — Koramangala hub",
      events: [
        {
          at: days(-2).toISOString(),
          status: "picked_up",
          location: "Hosur fulfilment centre",
          description: "Shipment picked up",
        },
        {
          at: days(-1).toISOString(),
          status: "in_transit",
          location: "Bengaluru — Bommasandra",
          description: "Arrived at sorting facility",
        },
        {
          at: days(0).toISOString(),
          status: "out_for_delivery",
          location: "Bengaluru — Koramangala hub",
          description: "Out for delivery with the field executive",
        },
      ],
    },
    {
      orderId: orderId("ORD-1041"),
      carrier: "Bluedart",
      trackingNumber: "BD77120455",
      status: "delivered" as const,
      estimatedDelivery: days(-5),
      shippedAt: days(-7),
      deliveredAt: days(-5),
      lastLocation: "Bengaluru — Indiranagar",
      events: [
        {
          at: days(-7).toISOString(),
          status: "picked_up",
          location: "Hosur fulfilment centre",
          description: "Shipment picked up",
        },
        {
          at: days(-5).toISOString(),
          status: "delivered",
          location: "Bengaluru — Indiranagar",
          description: "Delivered, signed for by the customer",
        },
      ],
    },
    {
      orderId: orderId("ORD-1039"),
      carrier: "Ekart",
      trackingNumber: "EK9930817264",
      status: "in_transit" as const,
      estimatedDelivery: days(2),
      shippedAt: days(-2),
      lastLocation: "Chennai — transit hub",
      events: [
        {
          at: days(-2).toISOString(),
          status: "picked_up",
          location: "Hosur fulfilment centre",
          description: "Shipment picked up",
        },
        {
          at: days(-1).toISOString(),
          status: "in_transit",
          location: "Chennai — transit hub",
          description: "In transit to destination city",
        },
      ],
    },
  ]);

  console.log("Seeding returns…");
  await db.insert(returns).values([
    {
      returnNumber: "RET-3006",
      userId,
      orderId: orderId("ORD-1037"),
      type: "exchange" as const,
      status: "in_transit" as const,
      reason: "Too narrow across the midfoot",
      requestedSizeUk: 6,
      windowClosesAt: days(-20 + RETURN_WINDOW_DAYS),
      requestedAt: days(-7),
    },
    {
      returnNumber: "RET-3007",
      userId,
      orderId: orderId("ORD-1040"),
      type: "refund" as const,
      status: "received" as const,
      reason: "Order cancelled before dispatch",
      windowClosesAt: days(-9 + RETURN_WINDOW_DAYS),
      requestedAt: days(-8),
    },
  ]);

  console.log("Seeding payments…");
  const paymentRows = await db
    .insert(payments)
    .values([
      // The double-charge case: two charges, same day, different amounts. The
      // second is the exchange price difference, and the correct answer is that
      // this is not a duplicate.
      {
        paymentNumber: "PAY-5008",
        userId,
        orderId: orderId("ORD-1037"),
        status: "succeeded" as const,
        amountPaise: rupees(1299),
        method: { brand: "HDFC", last4: "4412", type: "card" as const },
        purpose: "Order ORD-1037",
        processedAt: days(-24),
      },
      {
        paymentNumber: "PAY-5009",
        userId,
        orderId: orderId("ORD-1037"),
        status: "succeeded" as const,
        amountPaise: rupees(200),
        method: { brand: "HDFC", last4: "4412", type: "card" as const },
        purpose: "Exchange price difference for RET-3006",
        processedAt: days(-24),
      },
      {
        paymentNumber: "PAY-5010",
        userId,
        orderId: orderId("ORD-1041"),
        status: "succeeded" as const,
        amountPaise: rupees(1149),
        method: { brand: "UPI", last4: "8821", type: "upi" as const },
        purpose: "Order ORD-1041",
        processedAt: days(-9),
      },
      {
        paymentNumber: "PAY-5011",
        userId,
        orderId: orderId("ORD-1038"),
        status: "succeeded" as const,
        amountPaise: rupees(2299),
        method: { brand: "HDFC", last4: "4412", type: "card" as const },
        purpose: "Order ORD-1038",
        processedAt: days(-99),
      },
      {
        paymentNumber: "PAY-5012",
        userId,
        orderId: orderId("ORD-1042"),
        status: "succeeded" as const,
        amountPaise: rupees(704) + 4900,
        method: { brand: "UPI", last4: "8821", type: "upi" as const },
        purpose: "Order ORD-1042",
        processedAt: days(-4),
      },
      {
        paymentNumber: "PAY-5013",
        userId,
        orderId: orderId("ORD-1040"),
        status: "refunded" as const,
        amountPaise: rupees(429),
        method: { brand: "UPI", last4: "8821", type: "upi" as const },
        purpose: "Order ORD-1040",
        processedAt: days(-9),
      },
    ])
    .returning();

  const paymentByNumber = new Map(paymentRows.map((row) => [row.paymentNumber, row]));

  console.log("Seeding refunds…");
  await db.insert(refunds).values([
    {
      refundNumber: "REF-2043",
      userId,
      paymentId: paymentByNumber.get("PAY-5013")?.id ?? null,
      orderId: orderId("ORD-1040"),
      status: "processing" as const,
      amountPaise: rupees(429),
      reason: "Order cancelled before dispatch",
      requestedAt: days(-8),
      expectedCompletionAt: days(3),
    },
    {
      refundNumber: "REF-2044",
      userId,
      orderId: orderId("ORD-1038"),
      status: "completed" as const,
      amountPaise: rupees(1299),
      reason: "Price protection goodwill adjustment",
      requestedAt: days(-20),
      expectedCompletionAt: days(-16),
      completedAt: days(-15),
    },
  ]);

  console.log("Seeding knowledge base…");
  await db.insert(kbArticles).values([
    {
      slug: "size-chart-uk",
      title: "MaxiStep size chart (UK sizing)",
      category: "sizing",
      keywords: "size chart sizing uk fit measure length foot conversion what size",
      body: "MaxiStep sells in UK sizes only. Men's shoes run UK 6 to UK 12; women's run UK 3 to UK 8. Half sizes are available on most running and walking models. To measure: stand on a sheet of paper with your heel against a wall, mark the longest toe, and measure heel to mark in centimetres. UK 6 is about 24.5 cm, and each full UK size adds roughly 0.85 cm. Measure in the evening, when your feet are at their largest. If your measurement falls between two sizes, check the model's fit note on the product page — some models run small and some run large, and the fit note is the deciding factor.",
    },
    {
      slug: "fit-and-break-in",
      title: "Fit, break-in and which models run small",
      category: "sizing",
      keywords: "fit tight loose narrow wide break in heel slip rub blister runs small runs large",
      body: "Each MaxiStep model has its own fit note. The Airglide runs about half a size small, so size up if you are between sizes. The Meridian is built on a leather last that runs large — size down half a size. The Breeze is narrow through the midfoot and suits a lower instep. The Ridgeline has a deliberately roomy toe box for descents. The Easyslip is snug for the first week and relaxes as the suede gives. Leather and suede shoes need about a week of short wears to break in. Mesh and knit shoes do not break in — if they are tight on day one they will stay tight, and you should exchange them. Heel slip in a running shoe is usually a lacing problem before it is a size problem: try a runner's loop through the top eyelet before exchanging.",
    },
    {
      slug: "returns-14-day",
      title: "14-day return and exchange policy",
      category: "returns",
      keywords: "return refund exchange policy window 14 days unworn box send back",
      body: "You can return or exchange any MaxiStep order within 14 days of delivery. The shoes must be unworn, with the original box and all tags intact — try them on indoors, on a clean floor. Sole scuffing from outdoor wear makes an item ineligible. Start a return from your order and we arrange a free pickup; there is no return shipping charge. Once the item reaches our warehouse it goes through a quality check, which takes 2 working days. Refunds are issued to the original payment method within 5 to 7 working days after the quality check passes. Orders that were cancelled before dispatch are refunded without any of this. Worn shoes with a manufacturing defect are covered separately under the 6-month sole warranty, not under this policy.",
    },
    {
      slug: "how-exchanges-work",
      title: "How size exchanges work",
      category: "returns",
      keywords: "exchange size swap replace different size how long pickup",
      body: "A size exchange keeps the same model and colour and changes only the size. Raise the exchange within 14 days of delivery and tell us the size you want. We check that size is in stock before confirming — if it is out of stock we will tell you and offer the nearest available size or a refund instead. A courier collects the original pair, usually within 2 working days. The replacement pair is dispatched once the collected pair passes the quality check at our warehouse, so expect 5 to 7 working days end to end. If the replacement size costs more or less than what you paid, the difference is charged or refunded separately and appears as its own line in your payment history.",
    },
    {
      slug: "sole-warranty-6-month",
      title: "6-month sole and construction warranty",
      category: "warranty",
      keywords: "warranty defect sole separation peeling glue split manufacturing worn damaged",
      body: "Every MaxiStep pair carries a 6-month warranty against manufacturing defects, counted from the delivery date. This covers sole separation, midsole splitting, failed stitching and hardware such as eyelets pulling out. It applies to worn shoes — that is the point of it — and it is separate from the 14-day return window. It does not cover normal wear: outsole tread wearing down, midsole cushioning softening with mileage, scuffs, creasing, or damage from heat, chemicals or machine washing. To claim, share photographs of the defect and your order number; assessment takes 3 working days. An upheld claim is resolved with a replacement pair in the same size where stock allows, or a refund where it does not.",
    },
    {
      slug: "delivery-timelines",
      title: "Delivery timelines and courier partners",
      category: "delivery",
      keywords: "delivery shipping how long courier track tracking dispatch when arrive",
      body: "Orders are dispatched from our Hosur fulfilment centre within 1 working day. Metro cities — Bengaluru, Chennai, Hyderabad, Mumbai, Delhi NCR, Pune, Kolkata — receive orders in 2 to 4 working days. The rest of India takes 4 to 7 working days. We ship with Delhivery, Bluedart and Ekart; the courier is assigned at dispatch and you cannot choose it. Delivery is free on orders above ₹999, otherwise a ₹49 shipping charge applies. You get a tracking number by SMS and email at dispatch. If tracking has not moved for 48 hours, contact us and we will raise it with the courier.",
    },
    {
      slug: "care-leather-and-mesh",
      title: "Caring for leather, suede and mesh shoes",
      category: "care",
      keywords: "care clean wash leather suede mesh knit machine wash polish waterproof dry",
      body: "Leather, such as the Meridian: wipe with a barely damp cloth, let it dry naturally, then polish with a neutral cream every few weeks. Never machine wash leather and never dry it near a heater — the leather cracks and the sole adhesive fails. Suede, such as the Easyslip: brush with a suede brush in one direction and treat marks with a suede eraser. Do not soak suede; water leaves permanent marks. Mesh and knit uppers, such as the Airglide and Breeze: remove the insoles and laces, hand wash with mild detergent and cold water, and air dry in shade. The Bolt is the only model rated for machine washing, on a cold gentle cycle inside a laundry bag. Stuff wet shoes with paper rather than using a dryer, and never dry any pair in direct sunlight.",
    },
    {
      slug: "price-adjustment",
      title: "Price drops after you have ordered",
      category: "billing",
      keywords: "price drop cheaper discount sale adjustment refund difference price protection",
      body: "MaxiStep does not offer price protection. If the price of something you bought drops after your order is dispatched, we cannot refund the difference — prices move with sales and stock, and an order is billed at the price at the time it was placed. What you can do instead: if you are still inside the 14-day return window and the shoes are unworn, return them for a full refund and place a fresh order at the current price. If your order has not been dispatched yet, cancel it and re-order at the new price. Support agents cannot issue a partial credit for a price difference, so please do not expect one to be offered.",
    },
  ]);

  console.log(
    `\nSeeded: ${CATALOGUE.length} products, ${orderRows.length} orders, ${paymentRows.length} payments, 8 articles.`,
  );
  console.log(`Customer: ${customer.name} <${customer.email}>\n`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
