package main

import "fmt"

func processData(user User, config Config, logger Logger, db Database, cache Cache) error {
	if user.IsActive {
		for _, item := range db.GetItems() {
			switch item.Status {
			case "active":
				if item.Priority > 10 {
					for cache.IsLocked() {
						fmt.Println("waiting")
					}
					logger.Log(item.ID)
				}
			case "pending":
				if item.CreatedAt < config.Cutoff {
					return fmt.Errorf("too old")
				}
			}
		}
	}
	return nil
}
