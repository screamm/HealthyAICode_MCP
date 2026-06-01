package main

import "fmt"

func processData(user User, config Config, logger Logger, db Database, cache Cache, options Options, reporter Reporter) error {
	if user.IsActive {
		for _, item := range db.GetItems() {
			switch item.Status {
			case "active":
				if item.Priority > 10 {
					for cache.IsLocked() {
						fmt.Println("waiting for cache")
					}
					if item.Type == "critical" {
						if config.Alerts {
							if reporter != nil {
								reporter.Alert(item.ID)
							}
						}
						logger.Log(fmt.Sprintf("critical item: %s", item.ID))
					} else {
						logger.Log(item.ID)
					}
				} else if item.Priority > 5 {
					if user.Role == "admin" {
						db.Prioritize(item.ID)
					}
				}
			case "pending":
				if item.CreatedAt < config.Cutoff {
					return fmt.Errorf("item %s is too old", item.ID)
				}
				if item.RetryCount > 3 {
					if config.AutoDelete {
						db.Delete(item.ID)
					} else {
						logger.Log(fmt.Sprintf("skipping expired: %s", item.ID))
					}
				}
			case "failed":
				logger.Log(fmt.Sprintf("failed item: %s", item.ID))
			}
		}
	}
	return nil
}
