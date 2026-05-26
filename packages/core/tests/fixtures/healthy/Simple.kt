/**
 * Simple Kotlin utilities.
 */
class MathUtils {
    /**
     * Adds two integers.
     */
    fun add(a: Int, b: Int): Int {
        return a + b
    }

    /**
     * Subtracts b from a.
     */
    fun subtract(a: Int, b: Int): Int {
        return a - b
    }
}

/**
 * Extension function: capitalise first letter.
 */
fun String.capitalised(): String {
    return this.replaceFirstChar { it.uppercase() }
}
