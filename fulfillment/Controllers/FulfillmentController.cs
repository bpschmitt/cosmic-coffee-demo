using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using FulfillmentService.Models;
using FulfillmentService.Services;

namespace FulfillmentService.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FulfillmentController : ControllerBase
{
    private readonly FulfillmentProcessor _fulfillmentProcessor;
    private readonly ILogger<FulfillmentController> _logger;
    private static readonly ActivitySource ActivitySource = new("FulfillmentService.FulfillmentController");

    public FulfillmentController(
        FulfillmentProcessor fulfillmentProcessor,
        ILogger<FulfillmentController> logger)
    {
        _fulfillmentProcessor = fulfillmentProcessor;
        _logger = logger;
    }

    [HttpPost("process")]
    public async Task<ActionResult> ProcessOrder([FromBody] ProcessOrderRequest request)
    {
        using var activity = ActivitySource.StartActivity("ProcessOrder");
        activity?.SetTag("order.id", request.OrderId);
        activity?.SetTag("customer.name", request.CustomerName);

        // Validate request
        if (request.OrderId <= 0)
        {
            _logger.LogWarning("Invalid order ID received: OrderId={OrderId}", request.OrderId);
            return BadRequest(new
            {
                success = false,
                error = "Invalid order ID. Order ID must be greater than 0."
            });
        }

        _logger.LogInformation("Order processing started: OrderId={OrderId}, CustomerName={CustomerName}, TotalAmount={TotalAmount}",
            request.OrderId, request.CustomerName, request.TotalAmount);

        try
        {
            var success = await _fulfillmentProcessor.ProcessOrderAsync(request);

            if (success)
            {
                _logger.LogInformation("Order processing completed: OrderId={OrderId}, CustomerName={CustomerName}",
                    request.OrderId, request.CustomerName);

                return Ok(new
                {
                    success = true,
                    message = $"Order {request.OrderId} processed successfully",
                    order_id = request.OrderId
                });
            }

            return StatusCode(500, new
            {
                success = false,
                error = "Failed to process order"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Order processing error: OrderId={OrderId}, CustomerName={CustomerName}",
                request.OrderId, request.CustomerName);

            return StatusCode(500, new
            {
                success = false,
                error = "Failed to process order",
                message = ex.Message
            });
        }
    }
}

