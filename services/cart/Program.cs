using System.Diagnostics;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Http;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Add session support for cart storage
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite = SameSiteMode.Lax; // Allow cross-site cookies when going through proxy
    options.Cookie.SecurePolicy = CookieSecurePolicy.None; // Allow cookies over HTTP (for internal services)
});

// Configure HttpClient for Products service
builder.Services.AddHttpClient("ProductsService", client =>
{
    var productsUrl = builder.Configuration["ProductsServiceUrl"] ?? "http://products:4001";
    client.BaseAddress = new Uri(productsUrl);
    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    client.Timeout = TimeSpan.FromSeconds(5);
});

// Register ProductsClient service
builder.Services.AddScoped<CartService.Services.ProductsClient>();

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
app.UseSession();

// Health check endpoint - register before controllers
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "cart" }));

app.UseAuthorization();
app.MapControllers();

// Run on port 4003, binding to all interfaces
app.Run("http://0.0.0.0:4003");

