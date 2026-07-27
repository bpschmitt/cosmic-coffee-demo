using log4net;
using log4net.Config;
using System.Reflection;

// Configure log4net
var logRepository = LogManager.GetRepository(Assembly.GetEntryAssembly());
var log4netConfigPath = Path.Combine(AppContext.BaseDirectory, "log4net.config");
if (File.Exists(log4netConfigPath))
{
    XmlConfigurator.Configure(logRepository, new FileInfo(log4netConfigPath));
}
else
{
    // Fallback: try current directory
    var fallbackPath = Path.Combine(Directory.GetCurrentDirectory(), "log4net.config");
    if (File.Exists(fallbackPath))
    {
        XmlConfigurator.Configure(logRepository, new FileInfo(fallbackPath));
    }
}

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

