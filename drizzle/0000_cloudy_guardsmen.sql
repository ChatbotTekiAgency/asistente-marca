CREATE TABLE "cuentas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ig_user_id" text NOT NULL,
	"username" text NOT NULL,
	"access_token_cifrado" text,
	"token_expira_en" timestamp with time zone,
	"perfil_marca" jsonb,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuentas_ig_user_id_unique" UNIQUE("ig_user_id")
);
