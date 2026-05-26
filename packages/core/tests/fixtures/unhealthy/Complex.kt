class OrderProcessor(
    private val db: Database,
    private val cache: Cache,
    private val mailer: Mailer,
    private val logger: Logger
) {
    // TODO: refactor this monster
    fun processOrder(
        orderId: Long,
        userId: Long,
        items: List<Item>,
        discount: Double,
        couponCode: String?
    ): ProcessResult {
        if (orderId <= 0) return ProcessResult.invalid("Bad order id")
        if (userId <= 0) return ProcessResult.invalid("Bad user id")
        if (items.isEmpty()) return ProcessResult.invalid("No items")

        val user = db.findUser(userId) ?: return ProcessResult.notFound("User")
        if (!user.isActive) return ProcessResult.forbidden("User inactive")

        var total = 0.0
        for (item in items) {
            if (item.quantity <= 0) continue
            if (item.price <= 0.0) {
                logger.warn("Bad price for item ${item.id}")
                continue
            }
            total += item.price * item.quantity
        }

        if (couponCode != null) {
            val coupon = cache.getCoupon(couponCode)
            if (coupon != null && coupon.isValid) {
                total *= (1.0 - coupon.discountRate)
            } else {
                logger.warn("Invalid coupon: $couponCode")
            }
        }

        total *= (1.0 - discount)

        val order = Order(orderId, userId, items, total)
        db.saveOrder(order)
        cache.put("order:$orderId", order)
        mailer.sendConfirmation(user.email, order)

        return ProcessResult.success(order)
    }
}
