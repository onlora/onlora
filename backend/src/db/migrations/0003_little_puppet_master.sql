CREATE TABLE "jam_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "visibility" SET DEFAULT 'public';--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "parent_post_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "root_post_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "remix_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "like_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "comment_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cover_img_url" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "jam_session_id" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "jam_sessions" ADD CONSTRAINT "jam_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_jam_session_id_jam_sessions_id_fk" FOREIGN KEY ("jam_session_id") REFERENCES "public"."jam_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_parent_post_id_posts_id_fk" FOREIGN KEY ("parent_post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_root_post_id_posts_id_fk" FOREIGN KEY ("root_post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "cover_img";