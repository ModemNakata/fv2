use sea_orm_migration::{
    prelude::{extension::postgres::Type, *},
    schema::*,
};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 1. Create visibility enum specifically for videos
        manager
            .create_type(
                Type::create()
                    .as_enum("video_visibility")
                    .values(["public", "private"]) // "unlisted",
                    .to_owned(),
            )
            .await?;

        // 2. Create the single consolidated `videos` table
        manager
            .create_table(
                Table::create()
                    .table("videos")
                    .if_not_exists()
                    // Base properties (formerly in content_items)
                    .col(
                        uuid("id")
                            .default(Expr::cust("gen_random_uuid()"))
                            .primary_key(),
                    )
                    .col(uuid("uploader_id"))
                    .col(string_len("title", 255))
                    .col(text_null("description"))
                    .col(string_len_null("thumbnail_url", 1024))
                    .col(
                        ColumnDef::new("visibility")
                            .custom("video_visibility")
                            .not_null()
                            .default("private"),
                    )
                    .col(timestamp("created_at").default(Expr::current_timestamp()))
                    .col(timestamp("updated_at").default(Expr::current_timestamp()))
                    // Video-specific properties (formerly in videos)
                    .col(integer_null("duration_seconds"))
                    .col(big_integer("view_count").default(0))
                    // Foreign key to users table
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_video_uploader")
                            .from("videos", "uploader_id")
                            .to("users", "id")
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 3. Create video_formats table (keeps the 1-to-many relationship for resolutions)
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
                    .col(string_len("resolution", 50))
                    .col(string_len("format", 50))
                    .col(string_len("storage_path", 1024))
                    .col(big_integer_null("file_size_bytes"))
                    .col(timestamp("created_at").default(Expr::current_timestamp()))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_video_format_video")
                            .from("video_formats", "video_id")
                            .to("videos", "id") // Updated to point to the new consolidated videos.id
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

        // 4. Create indices for querying videos
        manager
            .create_index(
                Index::create()
                    .name("idx_video_uploader")
                    .table("videos")
                    .col("uploader_id")
                    .col(("created_at", IndexOrder::Desc))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_video_main_feed")
                    .table("videos")
                    .col("visibility")
                    .col(("created_at", IndexOrder::Desc))
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table("video_formats").to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table("videos").to_owned())
            .await?;

        manager
            .drop_type(Type::drop().name("video_visibility").to_owned())
            .await?;

        Ok(())
    }
}
