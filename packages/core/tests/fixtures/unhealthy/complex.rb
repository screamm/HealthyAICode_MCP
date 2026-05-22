def process_data(user, config, logger, db, cache)
  result = []
  if user.active?
    db.get_items.each do |item|
      case item.status
      when :active
        if item.priority > 10
          while cache.locked?
            sleep(0.1)
          end
          logger.log(item.id)
          result << item
        end
      when :pending
        if item.created_at < config.cutoff
          raise "Too old"
        end
      end
    end
  end
  result
end
