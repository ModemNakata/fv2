pub use sea_orm_migration::prelude::*;

mod m20260609_052003_users;
mod m20260610_120444_content;
mod m20260618_184948_user_favorites;
mod m20260620_174420_user_purchases;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260609_052003_users::Migration),
            Box::new(m20260610_120444_content::Migration),
            Box::new(m20260618_184948_user_favorites::Migration),
            Box::new(m20260620_174420_user_purchases::Migration),
        ]
    }
}
