func processData(user: User, config: Config, logger: Logger, db: Database, cache: Cache) throws -> [Item] {
    var result: [Item] = []
    if user.isActive {
        for item in db.getItems() {
            switch item.status {
            case .active:
                if item.priority > 10 {
                    while cache.isLocked {
                        Thread.sleep(forTimeInterval: 0.1)
                    }
                    logger.log(item.id)
                    result.append(item)
                }
            case .pending:
                if item.createdAt < config.cutoff {
                    throw AppError.tooOld
                }
            default:
                break
            }
        }
    }
    return result
}
