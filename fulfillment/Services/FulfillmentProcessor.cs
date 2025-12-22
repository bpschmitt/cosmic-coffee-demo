using System.Data;
using Npgsql;
using FulfillmentService.Models;
using Microsoft.Extensions.Configuration;

namespace FulfillmentService.Services;

public class FulfillmentProcessor
{
    private readonly string _connectionString;
    private readonly ILogger<FulfillmentProcessor> _logger;

    public FulfillmentProcessor(IConfiguration configuration, ILogger<FulfillmentProcessor> logger)
    {
        var dbHost = configuration["DB_HOST"] ?? "localhost";
        var dbPort = configuration["DB_PORT"] ?? "5432";
        var dbName = configuration["DB_NAME"] ?? "cosmic_coffee";
        var dbUser = configuration["DB_USER"] ?? "postgres";
        var dbPassword = configuration["DB_PASSWORD"] ?? "postgres";

        _connectionString = $"Host={dbHost};Port={dbPort};Database={dbName};Username={dbUser};Password={dbPassword}";
        _logger = logger;
    }

    public async Task<bool> ProcessOrderAsync(ProcessOrderRequest request)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();

        try
        {
            // Simulate some processing time
            await Task.Delay(1000);

            // Log order event - processing started
            await using var cmd1 = new NpgsqlCommand(
                @"INSERT INTO order_events (order_id, event_type, event_data) 
                  VALUES ($1, $2, $3)",
                connection);
            cmd1.Parameters.AddWithValue(request.OrderId);
            cmd1.Parameters.AddWithValue("processing_started");
            var eventData1 = new NpgsqlParameter
            {
                NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.Jsonb,
                Value = System.Text.Json.JsonSerializer.Serialize(new
                {
                    customer_name = request.CustomerName,
                    total_amount = request.TotalAmount,
                    timestamp = DateTime.UtcNow.ToString("O")
                })
            };
            cmd1.Parameters.Add(eventData1);
            await cmd1.ExecuteNonQueryAsync();

            // Update order status to processing
            await using var cmd2 = new NpgsqlCommand(
                @"UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
                connection);
            cmd2.Parameters.AddWithValue("processing");
            cmd2.Parameters.AddWithValue(request.OrderId);
            await cmd2.ExecuteNonQueryAsync();

            // Simulate more processing
            await Task.Delay(1500);

            // Update status to completed
            await using var cmd3 = new NpgsqlCommand(
                @"UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
                connection);
            cmd3.Parameters.AddWithValue("completed");
            cmd3.Parameters.AddWithValue(request.OrderId);
            await cmd3.ExecuteNonQueryAsync();

            // Log completion event
            await using var cmd4 = new NpgsqlCommand(
                @"INSERT INTO order_events (order_id, event_type, event_data) 
                  VALUES ($1, $2, $3)",
                connection);
            cmd4.Parameters.AddWithValue(request.OrderId);
            cmd4.Parameters.AddWithValue("processing_completed");
            var eventData2 = new NpgsqlParameter
            {
                NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.Jsonb,
                Value = System.Text.Json.JsonSerializer.Serialize(new
                {
                    completed_at = DateTime.UtcNow.ToString("O")
                })
            };
            cmd4.Parameters.Add(eventData2);
            await cmd4.ExecuteNonQueryAsync();

            _logger.LogInformation("Order processing completed: OrderId={OrderId}, CustomerName={CustomerName}",
                request.OrderId, request.CustomerName);

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing order: OrderId={OrderId}", request.OrderId);

            // Log error event
            try
            {
                await using var cmd = new NpgsqlCommand(
                    @"INSERT INTO order_events (order_id, event_type, event_data) 
                      VALUES ($1, $2, $3)",
                    connection);
                cmd.Parameters.AddWithValue(request.OrderId);
                cmd.Parameters.AddWithValue("processing_error");
                var errorData = new NpgsqlParameter
                {
                    NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.Jsonb,
                    Value = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        error = ex.Message,
                        timestamp = DateTime.UtcNow.ToString("O")
                    })
                };
                cmd.Parameters.Add(errorData);
                await cmd.ExecuteNonQueryAsync();

                await using var cmd2 = new NpgsqlCommand(
                    @"UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
                    connection);
                cmd2.Parameters.AddWithValue("error");
                cmd2.Parameters.AddWithValue(request.OrderId);
                await cmd2.ExecuteNonQueryAsync();
            }
            catch (Exception dbError)
            {
                _logger.LogError(dbError, "Error logging error event");
            }

            throw;
        }
    }
}

