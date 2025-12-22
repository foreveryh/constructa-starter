CREATE TABLE "agent_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"sdk_session_id" text NOT NULL,
	"title" text,
	"claude_home_path" text NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_session_user" ON "agent_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_agent_session_updated" ON "agent_session" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_session_user_sdk" ON "agent_session" USING btree ("user_id","sdk_session_id");