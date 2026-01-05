CREATE TABLE "session_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"file_id" text NOT NULL,
	"file_path" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_document" ADD CONSTRAINT "session_document_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_document" ADD CONSTRAINT "session_document_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_session_document_session" ON "session_document" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_session_document_file" ON "session_document" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_session_document_unique" ON "session_document" USING btree ("session_id","file_id");