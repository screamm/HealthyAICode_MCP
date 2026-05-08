public class Complex {
    public String processData(
        Object[] items, Object config, Object options,
        Object callback, String mode, Object extra
    ) {
        if (items != null) {
            for (Object item : items) {
                int val = (int) item;
                if (val > 0) {
                    while (val > 1) {
                        if (val % 2 == 0) {
                            if ("fast".equals(mode)) {
                                return "fast";
                            } else if ("slow".equals(mode)) {
                                return "slow";
                            }
                        }
                        val--;
                    }
                } else if (val < -10) {
                    return "negative";
                }
            }
        } else if (extra != null) {
            return "extra";
        }
        return "default";
    }
}
