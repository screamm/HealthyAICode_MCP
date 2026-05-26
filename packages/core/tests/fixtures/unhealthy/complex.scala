class OrderProcessor(
    db: Database,
    cache: Cache,
    mailer: Mailer,
    logger: Logger
) {
  // TODO: refactor this monster
  def processOrder(
      orderId: Long,
      userId: Long,
      items: List[Item],
      discount: Double,
      couponCode: Option[String]
  ): ProcessResult = {
    if (orderId <= 0) return ProcessResult.invalid("Bad order id")
    if (userId <= 0) return ProcessResult.invalid("Bad user id")
    if (items.isEmpty) return ProcessResult.invalid("No items")

    val user = db.findUser(userId).getOrElse(return ProcessResult.notFound("User"))
    if (!user.isActive) return ProcessResult.forbidden("User inactive")

    var total = 0.0
    for (item <- items) {
      if (item.quantity <= 0) {}
      else if (item.price <= 0.0) {
        logger.warn(s"Bad price for item ${item.id}")
      } else {
        total += item.price * item.quantity
      }
    }

    couponCode match {
      case Some(code) =>
        cache.getCoupon(code) match {
          case Some(coupon) if coupon.isValid =>
            total *= (1.0 - coupon.discountRate)
          case _ =>
            logger.warn(s"Invalid coupon: $code")
        }
      case None => ()
    }

    total *= (1.0 - discount)

    val order = Order(orderId, userId, items, total)
    db.saveOrder(order)
    cache.put(s"order:$orderId", order)
    mailer.sendConfirmation(user.email, order)

    ProcessResult.success(order)
  }
}
