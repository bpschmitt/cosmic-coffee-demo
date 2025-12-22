package com.cosmiccoffee.products.repository;

import com.cosmiccoffee.products.model.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductRepository extends JpaRepository<Product, Integer> {
    @Query("SELECT p FROM Product p ORDER BY p.category, p.name")
    List<Product> findAllOrderedByCategoryAndName();
    
    Optional<Product> findById(Integer id);
}

