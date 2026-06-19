use sea_orm_migration::{
    prelude::{extension::postgres::Type, *},
    schema::*,
};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_type(
                Type::create()
                    .as_enum("content_type")
                    .values(["video", "image_set"])
                    .to_owned(),
            )
            .await?;

        manager
            .create_type(
                Type::create()
                    .as_enum("content_visibility")
                    .values(["public", "unlisted", "private"])
                    .to_owned(),
            )
            .await?;

        manager
            .create_type(
                Type::create()
                    .as_enum("content_status")
                    .values(["uploading", "processing", "ready", "failed"])
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table("content_items")
                    .if_not_exists()
                    .col(
                        uuid("id") // uuid | primary
                            .default(Expr::cust("gen_random_uuid()"))
                            .primary_key(),
                    )
                    //  generate short version of url (slug?) id encoded to base62? #47
                    //
                    //    use it with short version of path: e.g. /v/ instead of /video/, or /g/ instead of /gallery/
                    //
                    // .col(
                    //     ColumnDef::new("id_digit")
                    //         .big_integer() // Use integer() if you expect < 2.1 billion items
                    //         .auto_increment()
                    //         .primary_key(),
                    // )
                    // .col(
                    //     ColumnDef::new("base62_id") // short encoded digital id
                    //         .string_len(11)
                    //         .unique_key() // Crucial for fast lookups
                    //         .not_null(),
                    // )
                    .col(uuid("uploader_id"))
                    .col(big_integer("view_count").default(0))
                    .col(ColumnDef::new("type").custom("content_type").not_null())
                    .col(string_len("title", 255))
                    .col(text_null("description"))
                    .col(string_len_null("thumbnail_url", 1024))
                    .col(
                        ColumnDef::new("status")
                            .custom("content_status")
                            .not_null()
                            .default("uploading"),
                    )
                    .col(
                        ColumnDef::new("visibility")
                            .custom("content_visibility")
                            .not_null()
                            .default("private"),
                    )
                    .col(timestamp("created_at").default(Expr::current_timestamp()))
                    .col(timestamp("updated_at").default(Expr::current_timestamp()))
                    .col(integer("price_cents").default(0).not_null())
                    .col(boolean("is_paywalled").default(false).not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_content_uploader")
                            .from("content_items", "uploader_id")
                            .to("users", "id")
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table("videos")
                    .if_not_exists()
                    .col(uuid("content_id").primary_key())
                    .col(integer_null("duration_seconds"))
                    .col(string_len("source_quality", 10).null()) // e.g. "1080p", "1080p60", "4K" | shouldn't be null ?
                    .col(string_len("source_resolution", 10).null()) // e.g. WxH (1920x1080) | actually shouldn't be null
                    // ^ can also include resolution_dimensions (?)
                    .col(integer_null("free_preview_duration_s"))
                    .col(string_len("preview_path", 1024).null())
                    // .col(big_integer("view_count").default(0))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_video_content")
                            .from("videos", "content_id")
                            .to("content_items", "id")
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(), // (?)
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table("video_formats")
                    .if_not_exists()
                    .col(
                        uuid("id")
                            .default(Expr::cust("gen_random_uuid()"))
                            .primary_key(),
                    )
                    .col(uuid("video_id"))
                    .col(string_len("resolution", 50)) // source
                    .col(string_len("format", 50))
                    .col(string_len("orig_storage_path", 1024)) // original
                    .col(string_len("storage_path", 1024).null())
                    .col(string_len("original_name", 1024)) // should
                    .col(big_integer_null("file_size_bytes"))
                    .col(timestamp("created_at").default(Expr::current_timestamp()))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_video_format_video")
                            .from("video_formats", "video_id")
                            .to("videos", "content_id")
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .index(
                        Index::create()
                            .unique()
                            .name("uq_video_formats")
                            .col("video_id")
                            .col("resolution")
                            .col("format"),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table("image_sets")
                    .if_not_exists()
                    .col(uuid("content_id").primary_key())
                    .col(string_len_null("layout_preference", 50).default("gallery"))
                    .col(string_len("preview_path", 1024).null())
                    // .col(big_integer("view_count").default(0))
                    .col(integer_null("unblurred_count"))
                    // .col(integer("image_count"))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_image_set_content")
                            .from("image_sets", "content_id")
                            .to("content_items", "id")
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table("images")
                    .if_not_exists()
                    .col(
                        uuid("id")
                            .default(Expr::cust("gen_random_uuid()"))
                            .primary_key(),
                    )
                    .col(uuid("image_set_id"))
                    .col(string_len("orig_storage_path", 1024))
                    .col(string_len("storage_path", 1024).null())
                    .col(string_len("original_name", 1024))
                    .col(integer("sort_order").default(0))
                    .col(string_len_null("alt_text", 255))
                    .col(string_len_null("blurred_storage_path", 1024))
                    .col(timestamp("created_at").default(Expr::current_timestamp()))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_image_set")
                            .from("images", "image_set_id")
                            .to("image_sets", "content_id")
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_content_uploader")
                    .table("content_items")
                    .col("uploader_id")
                    .col(("created_at", IndexOrder::Desc))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_content_main_feed")
                    .table("content_items")
                    .col("visibility")
                    .col("status")
                    .col(("created_at", IndexOrder::Desc))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_images_ordered")
                    .table("images")
                    .col("image_set_id")
                    .col("sort_order")
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_content_paywalled_feed")
                    .table("content_items")
                    .col("is_paywalled")
                    .col("status")
                    .col(("created_at", IndexOrder::Desc))
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table("images").to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table("image_sets").to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table("video_formats").to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table("videos").to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table("content_items").to_owned())
            .await?;

        manager
            .drop_type(Type::drop().name("content_visibility").to_owned())
            .await?;
        manager
            .drop_type(Type::drop().name("content_status").to_owned())
            .await?;
        manager
            .drop_type(Type::drop().name("content_type").to_owned())
            .await?;

        Ok(())
    }
}

//.col(string_len("original_name", 1024)) // should be optional ? (???)
//.col(string_len("original_name", 1024)) // should be optional? (???)
//.col(string_len("original_name", 1024)) // should be optional(???)
//.col(string_len("original_name", 1024)) // should be optional???
