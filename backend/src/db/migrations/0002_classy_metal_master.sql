CREATE TABLE "post_images" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"post_id" bigint NOT NULL,
	"image_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;