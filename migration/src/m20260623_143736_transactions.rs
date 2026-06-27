use sea_orm_migration::prelude::extension::postgres::Type;
use sea_orm_migration::{prelude::*, schema::*}; // Required for Type::create()

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 1. Create the custom Postgres ENUM type
        manager
            .create_type(
                Type::create()
                    .as_enum("transaction_status")
                    .values(["pending", "completed", "failed", "refunded"])
                    .to_owned(),
            )
            .await?;

        // 2. Create the Table
        manager
            .create_table(
                Table::create()
                    .table("transactions")
                    .if_not_exists()
                    .col(
                        uuid("id")
                            .primary_key()
                            .default(Expr::cust("gen_random_uuid()")),
                    )
                    .col(uuid("buyer_id"))
                    .col(uuid("seller_id"))
                    .col(uuid("content_id").null())
                    // .col(ColumnDef::new("amount").decimal_len(12, 2).not_null())
                    // .col(
                    //     ColumnDef::new("platform_fee")
                    //         .decimal_len(12, 2)
                    //         .not_null()
                    //         .default(0.00),
                    // )
                    .col(integer("amount_cents")) // USD
                    // .col(integer("platform_fee_cents").default(0))
                    // .col(string_len("currency", 3).default("USD")) // 3 | actually should always be static, we always use USD for this platform
                    // Use your custom type here
                    .col(
                        ColumnDef::new("status")
                            .custom("transaction_status")
                            .not_null()
                            .default("pending"), // after deposit creation on provider side?
                    )
                    .col(string_len("payment_provider_id", 255).null().unique_key()) // by cryptowrap
                    .col(timestamp("created_at").default(Expr::current_timestamp()))
                    .col(timestamp("updated_at").default(Expr::current_timestamp()))
                    // Constraints
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_transactions_buyer")
                            .from("transactions", "buyer_id")
                            .to("users", "id"),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_transactions_seller")
                            .from("transactions", "seller_id")
                            .to("users", "id"),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_transactions_content")
                            .from("transactions", "content_id")
                            .to("content_items", "id")
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Indexes
        manager
            .create_index(
                Index::create()
                    .name("idx_transactions_buyer")
                    .table("transactions")
                    .col("buyer_id")
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .name("idx_transactions_seller")
                    .table("transactions")
                    .col("seller_id")
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .name("idx_transactions_status")
                    .table("transactions")
                    .col("status")
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop table first because it relies on the custom type
        manager
            .drop_table(Table::drop().table("transactions").to_owned())
            .await?;

        // Drop custom type
        manager
            .drop_type(Type::drop().name("transaction_status").to_owned())
            .await?;

        Ok(())
    }
}
