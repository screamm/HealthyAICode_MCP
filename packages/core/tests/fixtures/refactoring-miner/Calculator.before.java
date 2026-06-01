package src;

public class Calculator {
    public int total(int[] values) {
        int sum = 0;
        for (int v : values) {
            sum += v;
            System.out.println("adding " + v);
        }
        return sum;
    }
}
