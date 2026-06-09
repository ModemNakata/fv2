pub use sea_orm_migration::prelude::*;

mod m20260609_052003_users;
mod m20260609_095907_videos;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260609_052003_users::Migration),
            Box::new(m20260609_095907_videos::Migration),
        ]
    }
}
