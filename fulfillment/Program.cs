var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Register FulfillmentProcessor
builder.Services.AddScoped<FulfillmentService.Services.FulfillmentProcessor>();

// Configure CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();

// Health check endpoint - register before controllers
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "fulfillment" }));

app.UseAuthorization();
app.MapControllers();

// Run on port 5000, binding to all interfaces
app.Run("http://0.0.0.0:5000");

