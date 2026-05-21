fn process_data(user: &User, config: &Config, logger: &Logger, db: &Database, cache: &Cache) -> Result<Vec<Item>, Error> {
    if user.is_active() {
        for item in db.get_items()? {
            match item.status {
                Status::Active => {
                    if item.priority > 10 {
                        while cache.is_locked() {
                            std::thread::sleep(Duration::from_millis(100));
                        }
                        logger.log(&format!("Processing {}", item.id));
                    }
                }
                Status::Pending => {
                    if item.created_at < config.cutoff {
                        return Err(Error::TooOld);
                    }
                }
                _ => {}
            }
        }
    }
    Ok(vec![])
}
