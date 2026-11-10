
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const cuentas = pgTable("cuentas", {
  id: uuid("id").defaultRandom().primaryKey(),

  igUserId: text("ig_user_id")
    .notNull()
    .unique(),

  username: text("username").notNull(),

  accessTokenCifrado: text("access_token_cifrado"),

  tokenExpiraEn: timestamp("token_expira_en", {
    withTimezone: true,
  }),

  perfilMarca: jsonb("perfil_marca").$type<
    Record<string, unknown>
  >(),

  creadaEn: timestamp("creada_en", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  actualizadaEn: timestamp("actualizada_en", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});
