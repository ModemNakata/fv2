use sea_orm_migration::{prelude::*, schema::*, sea_orm::ConnectionTrait};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 1. Alter the `content_items` table to add the `purchase_count` counter
        manager
            .alter_table(
                Table::alter()
                    .table("content_items")
                    .add_column(
                        ColumnDef::new("purchase_count")
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await?;

        // 2. Create the `user_purchases` junction table
        manager
            .create_table(
                Table::create()
                    .table("user_purchases")
                    .if_not_exists()
                    .col(uuid("user_id"))
                    .col(uuid("content_id"))
                    .col(timestamp("created_at").default(Expr::current_timestamp()))
                    // Composite Primary Key guarantees a user can only purchase an item once
                    .primary_key(
                        Index::create()
                            .name("pk_user_purchases")
                            .col("user_id")
                            .col("content_id"),
                    )
                    // Foreign key constraint to the users table
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_user_purchases_user")
                            .from("user_purchases", "user_id")
                            .to("users", "id")
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    // Foreign key constraint to the content_items table
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_user_purchases_content")
                            .from("user_purchases", "content_id")
                            .to("content_items", "id")
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 3. Use execute_unprepared for the PostgreSQL database trigger statements
        let db = manager.get_connection();

        // Create the trigger function
        db.execute_unprepared(r#"
            CREATE OR REPLACE FUNCTION update_purchase_count()
            RETURNS TRIGGER AS $$
            BEGIN
                IF (TG_OP = 'INSERT') THEN
                    UPDATE content_items SET purchase_count = purchase_count + 1 WHERE id = NEW.content_id;
                ELSIF (TG_OP = 'DELETE') THEN
                    UPDATE content_items SET purchase_count = purchase_count - 1 WHERE id = OLD.content_id;
                END IF;
                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        "#)
        .await?;

        // Bind the function to the junction table
        db.execute_unprepared(
            r#"
            CREATE TRIGGER purchase_count_trigger
            AFTER INSERT OR DELETE ON user_purchases
            FOR EACH ROW EXECUTE FUNCTION update_purchase_count();
        "#,
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        // 1. Drop trigger and its tracking function safely using execute_unprepared
        db.execute_unprepared("DROP TRIGGER IF EXISTS purchase_count_trigger ON user_purchases;")
            .await?;

        db.execute_unprepared("DROP FUNCTION IF EXISTS update_purchase_count();")
            .await?;

        // 2. Drop the junction table
        manager
            .drop_table(Table::drop().table("user_purchases").to_owned())
            .await?;

        // 3. Remove the `purchase_count` column from `content_items`
        manager
            .alter_table(
                Table::alter()
                    .table("content_items")
                    .drop_column(Alias::new("purchase_count"))
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}
