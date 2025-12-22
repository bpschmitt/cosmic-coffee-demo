namespace CartService.Models;

public class Cart
{
    public List<CartItem> Items { get; set; } = new();
    public decimal Total { get; set; }
}

