using System.Text.Json.Serialization;

namespace FulfillmentService.Models;

public class ProcessOrderRequest
{
    [JsonPropertyName("order_id")]
    public int OrderId { get; set; }
    
    [JsonPropertyName("customer_name")]
    public string CustomerName { get; set; } = string.Empty;
    
    [JsonPropertyName("total_amount")]
    public decimal TotalAmount { get; set; }
}

