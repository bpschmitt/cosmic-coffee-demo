using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using CartService.Models;
using CartService.Services;
using System.Text.Json;

namespace CartService.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CartController : ControllerBase
{
    private readonly ProductsClient _productsClient;
    private readonly ILogger<CartController> _logger;
    private static readonly ActivitySource ActivitySource = new("CartService.CartController");
    private const string CartSessionKey = "Cart";

    public CartController(ProductsClient productsClient, ILogger<CartController> logger)
    {
        _productsClient = productsClient;
        _logger = logger;
    }

    private List<CartItem> GetCartFromSession()
    {
        var cartJson = HttpContext.Session.GetString(CartSessionKey);
        if (string.IsNullOrEmpty(cartJson))
        {
            return new List<CartItem>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<CartItem>>(cartJson) ?? new List<CartItem>();
        }
        catch
        {
            return new List<CartItem>();
        }
    }

    private void SaveCartToSession(List<CartItem> cart)
    {
        var cartJson = JsonSerializer.Serialize(cart);
        HttpContext.Session.SetString(CartSessionKey, cartJson);
    }

    [HttpGet]
    public async Task<ActionResult<Cart>> GetCart()
    {
        using var activity = ActivitySource.StartActivity("GetCart");
        
        var items = GetCartFromSession();
        var total = items.Sum(item => (item.Price ?? 0) * item.Quantity);

        return Ok(new Cart
        {
            Items = items,
            Total = total
        });
    }

    [HttpPost("items")]
    public async Task<ActionResult<Cart>> AddItem([FromBody] AddItemRequest request)
    {
        using var activity = ActivitySource.StartActivity("AddItemToCart");
        activity?.SetTag("product.id", request.ProductId);
        activity?.SetTag("quantity", request.Quantity);

        // Propagate trace headers
        var traceparent = Request.Headers["traceparent"].FirstOrDefault();
        var tracestate = Request.Headers["tracestate"].FirstOrDefault();

        try
        {
            // Validate product exists by fetching from Products service
            var product = await _productsClient.GetProductAsync(request.ProductId, traceparent, tracestate);
            
            if (product == null)
            {
                return NotFound(new { error = $"Product {request.ProductId} not found" });
            }

            var cart = GetCartFromSession();
            var existingItem = cart.FirstOrDefault(item => item.ProductId == request.ProductId);

            if (existingItem != null)
            {
                existingItem.Quantity += request.Quantity;
            }
            else
            {
                cart.Add(new CartItem
                {
                    ProductId = product.Id,
                    Quantity = request.Quantity,
                    ProductName = product.Name,
                    Price = product.Price
                });
            }

            SaveCartToSession(cart);

            var total = cart.Sum(item => (item.Price ?? 0) * item.Quantity);

            _logger.LogInformation("Item added to cart: ProductId={ProductId}, Quantity={Quantity}", 
                request.ProductId, request.Quantity);

            return Ok(new Cart
            {
                Items = cart,
                Total = total
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding item to cart");
            return StatusCode(503, new { error = "Products service unavailable" });
        }
    }

    [HttpDelete("items/{productId}")]
    public ActionResult<Cart> RemoveItem(int productId)
    {
        using var activity = ActivitySource.StartActivity("RemoveItemFromCart");
        activity?.SetTag("product.id", productId);

        var cart = GetCartFromSession();
        cart.RemoveAll(item => item.ProductId == productId);
        SaveCartToSession(cart);

        var total = cart.Sum(item => (item.Price ?? 0) * item.Quantity);

        _logger.LogInformation("Item removed from cart: ProductId={ProductId}", productId);

        return Ok(new Cart
        {
            Items = cart,
            Total = total
        });
    }

    [HttpPatch("items/{productId}")]
    public ActionResult<Cart> UpdateItem(int productId, [FromBody] UpdateItemRequest request)
    {
        using var activity = ActivitySource.StartActivity("UpdateItemInCart");
        activity?.SetTag("product.id", productId);
        activity?.SetTag("quantity", request.Quantity);

        var cart = GetCartFromSession();
        var item = cart.FirstOrDefault(i => i.ProductId == productId);

        if (item == null)
        {
            return NotFound(new { error = $"Item {productId} not found in cart" });
        }

        if (request.Quantity <= 0)
        {
            cart.RemoveAll(i => i.ProductId == productId);
        }
        else
        {
            item.Quantity = request.Quantity;
        }

        SaveCartToSession(cart);

        var total = cart.Sum(i => (i.Price ?? 0) * i.Quantity);

        _logger.LogInformation("Item updated in cart: ProductId={ProductId}, Quantity={Quantity}", 
            productId, request.Quantity);

        return Ok(new Cart
        {
            Items = cart,
            Total = total
        });
    }

    [HttpDelete]
    public ActionResult ClearCart()
    {
        using var activity = ActivitySource.StartActivity("ClearCart");

        HttpContext.Session.Remove(CartSessionKey);

        _logger.LogInformation("Cart cleared");

        return Ok(new { message = "Cart cleared" });
    }
}

