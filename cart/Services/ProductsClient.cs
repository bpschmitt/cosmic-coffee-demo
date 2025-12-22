using System.Diagnostics;
using System.Net.Http.Headers;
using CartService.Models;
using System.Text.Json;

namespace CartService.Services;

public class ProductsClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<ProductsClient> _logger;
    private static readonly ActivitySource ActivitySource = new("CartService.ProductsClient");

    public ProductsClient(IHttpClientFactory httpClientFactory, ILogger<ProductsClient> logger)
    {
        _httpClient = httpClientFactory.CreateClient("ProductsService");
        _logger = logger;
    }

    public async Task<ProductInfo?> GetProductAsync(int productId, string? traceparent = null, string? tracestate = null)
    {
        using var activity = ActivitySource.StartActivity("GetProduct");
        activity?.SetTag("product.id", productId);

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get, $"/api/products/{productId}");
            
            // Propagate trace headers
            if (!string.IsNullOrEmpty(traceparent))
            {
                request.Headers.Add("traceparent", traceparent);
            }
            if (!string.IsNullOrEmpty(tracestate))
            {
                request.Headers.Add("tracestate", tracestate);
            }

            var response = await _httpClient.SendAsync(request);
            
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                return null;
            }

            response.EnsureSuccessStatusCode();
            
            var jsonString = await response.Content.ReadAsStringAsync();
            var product = JsonSerializer.Deserialize<ProductInfo>(jsonString, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            return product;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching product {ProductId}", productId);
            throw;
        }
    }
}

public class ProductInfo
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public string? Category { get; set; }
}

