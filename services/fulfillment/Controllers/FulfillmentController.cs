using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using FulfillmentService.Models;
using FulfillmentService.Services;
using log4net;

namespace FulfillmentService.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FulfillmentController : ControllerBase
{
    private readonly FulfillmentProcessor _fulfillmentProcessor;
    private static readonly ILog _logger = LogManager.GetLogger(typeof(FulfillmentController));
    private static readonly ActivitySource ActivitySource = new("FulfillmentService.FulfillmentController");

    public FulfillmentController(FulfillmentProcessor fulfillmentProcessor)
    {
        _fulfillmentProcessor = fulfillmentProcessor;
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
            _logger.WarnFormat("Invalid order ID received: OrderId={0}", request.OrderId);
            return BadRequest(new
            {
                success = false,
                error = "Invalid order ID. Order ID must be greater than 0."
            });
        }

        _logger.InfoFormat("Order processing started: OrderId={0}, CustomerName={1}, TotalAmount={2}",
            request.OrderId, request.CustomerName, request.TotalAmount);

        try
        {
            var success = await _fulfillmentProcessor.ProcessOrderAsync(request);

            if (success)
            {
                _logger.InfoFormat("Order processing completed: OrderId={0}, CustomerName={1}",
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
            _logger.Error($"Order processing error: OrderId={request.OrderId}, CustomerName={request.CustomerName}, Error={ex.Message}", ex);

            return StatusCode(500, new
            {
                success = false,
                error = "Failed to process order",
                message = ex.Message
            });
        }
    }
}

