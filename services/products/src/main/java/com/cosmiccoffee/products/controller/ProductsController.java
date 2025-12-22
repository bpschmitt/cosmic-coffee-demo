package com.cosmiccoffee.products.controller;

import com.cosmiccoffee.products.model.Product;
import com.cosmiccoffee.products.service.ProductService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/products")
@CrossOrigin(origins = "*")
public class ProductsController {
    private static final Logger logger = LoggerFactory.getLogger(ProductsController.class);
    
    private final ProductService productService;

    @Autowired
    public ProductsController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    public ResponseEntity<List<Product>> getAllProducts() {
        try {
            List<Product> products = productService.getAllProducts();
            logger.info("Retrieved {} products", products.size());
            return ResponseEntity.ok(products);
        } catch (Exception e) {
            logger.error("Error fetching products", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<Product> getProductById(@PathVariable Integer id) {
        try {
            return productService.getProductById(id)
                    .map(product -> {
                        logger.info("Retrieved product with id: {}", id);
                        return ResponseEntity.ok(product);
                    })
                    .orElseGet(() -> {
                        logger.warn("Product with id {} not found", id);
                        return ResponseEntity.notFound().build();
                    });
        } catch (Exception e) {
            logger.error("Error fetching product with id: {}", id, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "service", "products"
        ));
    }
}

