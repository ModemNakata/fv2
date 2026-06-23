use sea_orm_migration::{prelude::*, schema::*, sea_orm::ConnectionTrait};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table("notifications")
                    .if_not_exists()
                    .col(
                        uuid("id")
                            .primary_key()
                            .default(Expr::cust("gen_random_uuid()")),
                    )
                    .col(uuid("user_id"))
                    .col(uuid("actor_id").null()) // Null // Nullable for system alerts
                    .col(string_len("type", 50)) // -- e.g., 'purchase_success', 'new_follower', 'content_liked'
                    .col(json_binary("metadata").default(Expr::cust("'{}'::jsonb")))
                    .col(boolean("is_read").default(false))
                    .col(timestamp("created_at").default(Expr::current_timestamp()))
                    // Constraints
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_notifications_user")
                            .from("notifications", "user_id")
                            .to("users", "id"),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_notifications_actor")
                            .from("notifications", "actor_id")
                            .to("users", "id"),
                    )
                    .to_owned(),
            )
            .await?;

        // 1. Standard lookup index
        manager
            .create_index(
                Index::create()
                    .name("idx_notifications_user_id")
                    .table("notifications")
                    .col("user_id")
                    .to_owned(),
            )
            .await?;

        // Get the inner connection driver for raw SQL execution
        let db = manager.get_connection();

        // 2. Partial index for unread counts
        db.execute_unprepared(
            "CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE is_read = FALSE;"
        )
        .await?;

        // 3. GIN Index for querying JSONB fields
        db.execute_unprepared(
            "CREATE INDEX idx_notifications_metadata ON notifications USING gin (metadata);",
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table("notifications").to_owned())
            .await
    }
}
