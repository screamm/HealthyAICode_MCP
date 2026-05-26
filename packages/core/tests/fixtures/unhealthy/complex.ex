defmodule OrderProcessor do
  # TODO: refactor this monster
  def process_order(order_id, user_id, items, discount, coupon_code) do
    if order_id <= 0 do
      {:error, :bad_order_id}
    else
      if user_id <= 0 do
        {:error, :bad_user_id}
      else
        if Enum.empty?(items) do
          {:error, :no_items}
        else
          case fetch_user(user_id) do
            {:ok, user} ->
              if user.active do
                total =
                  Enum.reduce(items, 0.0, fn item, acc ->
                    if item.quantity <= 0 do
                      acc
                    else
                      acc + item.price * item.quantity
                    end
                  end)

                total =
                  case coupon_code do
                    nil ->
                      total

                    code ->
                      case get_coupon(code) do
                        {:ok, coupon} when coupon.valid ->
                          total * (1.0 - coupon.discount_rate)

                        _ ->
                          total
                      end
                  end

                {:ok, total * (1.0 - discount)}
              else
                {:error, :user_inactive}
              end

            {:error, reason} ->
              {:error, reason}
          end
        end
      end
    end
  end

  defp fetch_user(user_id), do: {:ok, %{id: user_id, active: true}}
  defp get_coupon(code), do: {:ok, %{code: code, valid: true, discount_rate: 0.1}}
end
