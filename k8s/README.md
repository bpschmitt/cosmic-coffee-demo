# Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying the Cosmic Coffee demo application.

## Prerequisites

- Kubernetes cluster (local with minikube/kind, or cloud-based)
- kubectl configured to access your cluster
- Docker images built and available (either locally for minikube/kind, or in a container registry)

## Building Docker Images

Before deploying to Kubernetes, you need to build the Docker images. This guide uses Docker buildx to create multi-architecture images (arm64 and amd64) for compatibility with different CPU architectures.

### Prerequisites

Ensure Docker buildx is available (included in Docker Desktop 19.03+):
```bash
docker buildx version
```

Create and use a buildx builder instance:
```bash
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap
```

### Option 1: Build and use with Minikube/Kind (local development)

**Building for a specific architecture on Apple Silicon (M1/M2/M3):**

If you're on an Apple Silicon Mac and need to build for amd64 (x86_64) architecture:

```bash
# Build for amd64 only (slower due to emulation, but ensures compatibility)
docker buildx build --platform linux/amd64 -t cosmic-coffee-frontend:latest --load ./frontend
docker buildx build --platform linux/amd64 -t cosmic-coffee-backend:latest --load ./backend
```

**Note:** The `--load` flag only works with single-platform builds. Building for amd64 on Apple Silicon uses QEMU emulation, which is slower but allows you to create amd64 images locally.

If using minikube:
```bash
eval $(minikube docker-env)
# Build for your native architecture (arm64) - faster
docker build -t cosmic-coffee-frontend:latest ./frontend
docker build -t cosmic-coffee-backend:latest ./backend
```

If using kind:
```bash
# Build for your native architecture (arm64) - faster
docker build -t cosmic-coffee-frontend:latest ./frontend
docker build -t cosmic-coffee-backend:latest ./backend

# Load into kind
kind load docker-image cosmic-coffee-frontend:latest
kind load docker-image cosmic-coffee-backend:latest
```

### Option 2: Build multi-architecture images and push to a container registry

This option builds images for both arm64 and amd64 architectures, making them compatible with Apple Silicon (M1/M2), ARM-based servers, and traditional x86_64 servers.

**Build and push multi-architecture images:**

```bash
# Set your registry (replace with your registry URL)
REGISTRY="your-registry"  # e.g., "docker.io/bpschmitt" or "ghcr.io/yourusername"

# Build and push frontend (arm64 + amd64)
docker buildx build \
  --platform linux/arm64,linux/amd64 \
  -t $REGISTRY/cosmic-coffee-frontend:latest \
  -t $REGISTRY/cosmic-coffee-frontend:main \
  --push \
  ./frontend

# Build and push backend (arm64 + amd64)
docker buildx build \
  --platform linux/arm64,linux/amd64 \
  -t $REGISTRY/cosmic-coffee-backend:latest \
  -t $REGISTRY/cosmic-coffee-backend:main \
  --push \
  ./backend

```

**To build without pushing (save locally for one architecture):**

```bash
# Build for your current platform only (faster for testing)
docker buildx build \
  --platform linux/arm64,linux/amd64 \
  -t cosmic-coffee-frontend:latest \
  --load \
  ./frontend
```

**Note:** The `--load` flag only works for single-platform builds. For multi-platform builds, you must use `--push` to push to a registry, then pull the specific platform you need.

Then update the image names in the deployment YAML files to match your registry.

### Option 3: Using the Build Script

A convenience script is provided to build all images at once:

```bash
# Set your registry (optional, defaults to "bpschmitt")
export DOCKER_REGISTRY="your-registry"

# Set version tag (optional, defaults to "latest")
export VERSION="v1.0.0"

# Build and push all images
./scripts/build-multiarch.sh
```

The script builds all services for both arm64 and amd64 architectures and pushes them to your registry.

### Building AMD64 Images on Apple Silicon

If you're on an Apple Silicon Mac (M1/M2/M3) and need to build amd64 images locally:

**Option A: Using the convenience script**
```bash
# Build and load amd64 images locally (slower due to QEMU emulation)
./scripts/build-amd64.sh

# Or build and push to registry
export DOCKER_REGISTRY="your-registry"
export PUSH="true"
./scripts/build-amd64.sh
```

**Option B: Using buildx directly**
```bash
# Build for amd64 only
docker buildx build --platform linux/amd64 -t cosmic-coffee-backend:latest --load ./backend
```

**Performance Note:** Building amd64 images on Apple Silicon uses QEMU emulation, which is significantly slower than native arm64 builds. For faster builds, consider:
- Building multi-arch images and pushing to a registry (Option 2 above)
- Using a remote builder or CI/CD pipeline
- Building directly on an amd64 machine or in the cloud

## Deployment Steps

You have two options for deployment:
1. **Using Kustomize (Recommended)** - Deploy all resources at once using the kustomization.yaml file
2. **Manual Deployment** - Deploy resources individually in order

### Option 1: Using Kustomize (Recommended)

Kustomize is built into `kubectl` (since v1.14+), making it the easiest way to deploy all resources at once:

```bash
# Deploy everything using kustomize
kubectl apply -k .

# Or explicitly specify the kustomization file
kubectl apply -k kustomization.yaml
```

This will create all resources defined in `kustomization.yaml` in the correct order.

To preview what will be created without applying:
```bash
kubectl kustomize .
```

To delete all resources:
```bash
kubectl delete -k .
```

**Benefits of using Kustomize:**
- Single command deployment
- Automatic namespace application to all resources
- Easy to customize (change namespace, add labels, etc.)
- Preview changes before applying

### Option 2: Manual Deployment

Deploy in the following order to ensure dependencies are met:

1. **Create the namespace:**
```bash
kubectl apply -f namespace.yaml
```

2. **Create secrets:**
```bash
kubectl apply -f secret-postgres.yaml
```

3. **Create ConfigMaps:**
```bash
kubectl apply -f configmap-init-sql.yaml
```

4. **Create PersistentVolume for PostgreSQL:**
```bash
kubectl apply -f postgres-pv.yaml
```

5. **Create PersistentVolumeClaim for PostgreSQL:**
```bash
kubectl apply -f postgres-pvc.yaml
```

6. **Deploy PostgreSQL:**
```bash
kubectl apply -f postgres-deployment.yaml
```

Wait for PostgreSQL to be ready:
```bash
kubectl wait --for=condition=ready pod -l app=postgres -n cosmic-coffee --timeout=120s
```

7. **Deploy Backend:**
```bash
kubectl apply -f backend-deployment.yaml
```

10. **Deploy Frontend:**
```bash
kubectl apply -f frontend-deployment.yaml
```

## Verify Deployment

Check the status of all pods:
```bash
kubectl get pods -n cosmic-coffee
```

Check services:
```bash
kubectl get services -n cosmic-coffee
```

View logs:
```bash
kubectl logs -f deployment/backend -n cosmic-coffee
kubectl logs -f deployment/frontend -n cosmic-coffee
```

## Accessing the Application

The frontend service is configured as a ClusterIP service. To access it, use port-forwarding:

```bash
kubectl port-forward service/frontend 3000:80 -n cosmic-coffee
```

Then access the application at http://localhost:3000

**Note:** For production deployments, you may want to configure an Ingress resource instead of using port-forwarding. The frontend service can also be changed to LoadBalancer type if your cloud provider supports it.

## Load Generation

A Locust load generator is included and runs automatically in headless mode (no UI interaction required).

**Default Configuration:**
- Runs automatically when the pod starts
- 10 concurrent users
- Spawn rate: 2 users/second
- Generates orders every 5 seconds per user

**To adjust load:**
Edit the environment variables in `k8s/loadgen-deployment.yaml`:
```yaml
env:
  - name: LOCUST_USERS
    value: "20"  # Change number of users
  - name: LOCUST_SPAWN_RATE
    value: "5"   # Change spawn rate
```

**Optional: Access the Locust web UI** (still available for monitoring):
```bash
kubectl port-forward service/loadgen 8089:8089 -n cosmic-coffee
```

Then open http://localhost:8089 in your browser to view real-time statistics.

The load generator simulates user behavior:
- Creating orders every 5 seconds (with random number of products)
- Includes the 25% error rate on order submissions
- Uses randomly generated fake customer names and emails

**To stop the load generator:**
```bash
kubectl scale deployment loadgen --replicas=0 -n cosmic-coffee
```

**To restart:**
```bash
kubectl scale deployment loadgen --replicas=1 -n cosmic-coffee
```

**View logs to verify load generation:**
```bash
kubectl logs -f deployment/loadgen -n cosmic-coffee
```

## Quick Deploy Script

If not using kustomize, you can deploy everything manually at once:
```bash
kubectl apply -f namespace.yaml
kubectl apply -f secret-postgres.yaml
kubectl apply -f configmap-init-sql.yaml
kubectl apply -f postgres-pv.yaml
kubectl apply -f postgres-pvc.yaml
kubectl apply -f postgres-deployment.yaml
kubectl apply -f backend-deployment.yaml
kubectl apply -f frontend-deployment.yaml
kubectl apply -f loadgen-deployment.yaml
```

**Note:** Using `kubectl apply -k .` (kustomize) is recommended as it's simpler and handles ordering automatically.

## Cleanup

### Using Kustomize (Recommended)
```bash
# Delete all resources defined in kustomization.yaml
kubectl delete -k .

# Then delete the namespace if needed
kubectl delete namespace cosmic-coffee
```

### Manual Cleanup
To remove all resources:
```bash
kubectl delete namespace cosmic-coffee
```

Or delete individual resources:
```bash
kubectl delete -f frontend-deployment.yaml
kubectl delete -f backend-deployment.yaml
kubectl delete -f postgres-deployment.yaml
kubectl delete -f postgres-pvc.yaml
kubectl delete -f postgres-pv.yaml
kubectl delete -f configmap-init-sql.yaml
kubectl delete -f secret-postgres.yaml
kubectl delete -f namespace.yaml
```

## Customization

### Using Kustomize for Customization

Kustomize allows you to customize deployments without editing the base YAML files. You can create overlay directories:

```bash
# Example: Create an overlay for production
mkdir -p overlays/production
cd overlays/production
```

Create a `kustomization.yaml` in your overlay:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: cosmic-coffee-prod

resources:
  - ../../

# Example: Change replica count
patchesStrategicMerge:
  - |-
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: backend
    spec:
      replicas: 5

# Example: Change image tags
images:
  - name: bpschmitt/cosmic-coffee-backend
    newTag: v1.0.0
  - name: bpschmitt/cosmic-coffee-frontend
    newTag: v1.0.0
```

Deploy with:
```bash
kubectl apply -k overlays/production
```

### Direct YAML Editing

Alternatively, you can edit the deployment YAML files directly:

#### Resource Limits

Edit the deployment YAML files to adjust resource requests and limits based on your cluster capacity.

#### Replicas

Change the `replicas` field in each deployment to scale services horizontally.

#### Image Pull Policy

The deployments use `IfNotPresent` by default. For production, consider using `Always` and pushing images to a registry with proper tagging.

#### Ingress (Optional)

For production deployments, consider adding an Ingress resource instead of using LoadBalancer for the frontend service.
