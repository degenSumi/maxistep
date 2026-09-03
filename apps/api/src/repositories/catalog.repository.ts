import {
  asc,
  eq,
  ilike,
  or,
  productVariants,
  products,
  sql,
  type Product,
  type ProductVariant,
} from "@repo/db";
import { db } from "../db.js";

// The catalogue is public data, so unlike the others these reads are not
// scoped to a user.
export const catalogRepository = {
  async findBySlug(slug: string): Promise<Product | null> {
    const [row] = await db
      .select()
      .from(products)
      .where(eq(products.slug, slug.toLowerCase()))
      .limit(1);
    return row ?? null;
  },

  /**
   * Customers say "the Oxyfit", not `oxyfit-men-walking`. Matching the slug,
   * the model name and the description covers both.
   */
  async search(query: string, limit = 5): Promise<Product[]> {
    const term = `%${query}%`;
    return db
      .select()
      .from(products)
      .where(
        or(
          ilike(products.slug, term),
          ilike(products.modelName, term),
          ilike(products.description, term),
          // `type` is a pgEnum, and Postgres has no ILIKE operator for enums —
          // it has to be cast to text first.
          ilike(sql`${products.type}::text`, term),
        ),
      )
      .orderBy(asc(products.pricePaise))
      .limit(limit);
  },

  async listAll(): Promise<Product[]> {
    return db.select().from(products).orderBy(asc(products.modelName));
  },

  async listVariants(productId: string): Promise<ProductVariant[]> {
    return db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(asc(productVariants.sizeUk));
  },
};
