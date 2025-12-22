package com.cosmiccoffee.products.service;

import com.cosmiccoffee.products.model.Product;
import com.cosmiccoffee.products.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class ProductService {
    private static final Logger logger = LoggerFactory.getLogger(ProductService.class);
    
    private final ProductRepository productRepository;

    @Autowired
    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    public List<Product> getAllProducts() {
        logger.info("Fetching all products");
        return productRepository.findAllOrderedByCategoryAndName();
    }

    public Optional<Product> getProductById(Integer id) {
        logger.info("Fetching product with id: {}", id);
        return productRepository.findById(id);
    }
}

