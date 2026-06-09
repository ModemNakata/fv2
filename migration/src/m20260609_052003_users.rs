use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table("users")
                    .if_not_exists()
                    .col(
                        uuid("id")
                            .primary_key()
                            .default(Expr::cust("gen_random_uuid()")),
                    )
                    // RFC 1035 + 1123 | is checked on uniqueness by lower-case
                    .col(string_len("username", 16).unique_key()) // 30
                    // | copied from username on initial registration, can be changed later in settings
                    .col(string_len("display_name", 32)) // 50
                    .col(string_len("password_hash", 255))
                    .col(timestamp("password_changed_at").default(Expr::current_timestamp()))
                    .col(timestamp("created_at").default(Expr::current_timestamp()))
                    .col(timestamp("updated_at").default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_users_username")
                    .table("users")
                    .col("username")
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table("users").to_owned())
            .await?;

        Ok(())
    }
}
