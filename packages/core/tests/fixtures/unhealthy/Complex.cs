public class Complex {
    public string ProcessData(
        object[] items, object config, object options,
        Action callback, string mode, object extra
    ) {
        if (items != null) {
            foreach (var item in items) {
                int val = (int)item;
                if (val > 0) {
                    while (val > 1) {
                        if (val % 2 == 0) {
                            if (mode == "fast") {
                                return "fast";
                            } else if (mode == "slow") {
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
