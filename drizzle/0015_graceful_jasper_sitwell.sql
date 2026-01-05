CREATE TYPE "public"."agent_id" AS ENUM('assistant-agent', 'translator-agent');--> statement-breakpoint
CREATE TABLE "mastra_thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" text NOT NULL,
	"agent_id" "agent_id" NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New Chat' NOT NULL,
	"is_auto_generated_title" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mastra_thread_thread_id_unique" UNIQUE("thread_id")
);
