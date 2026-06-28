package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/loop-xxi/loop-microloan/api/internal/handlers"
	"github.com/loop-xxi/loop-microloan/api/internal/middleware"
	"github.com/loop-xxi/loop-microloan/api/internal/repository"
	"github.com/loop-xxi/loop-microloan/api/internal/scheduler"
	"github.com/loop-xxi/loop-microloan/api/internal/services"
)

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = os.Getenv("SUPABASE_DB_URL")
	}
	if dbURL == "" {
		dbURL = os.Getenv("SUPABASE_URL") // backward compatibility: must be a Postgres URL here
	}
	if dbURL == "" {
		log.Fatal("DATABASE_URL or SUPABASE_DB_URL is required")
	}
	connStr := dbURL
	if !strings.Contains(connStr, "pool_max_conns=") {
		sep := "?"
		if strings.Contains(connStr, "?") {
			sep = "&"
		}
		connStr += sep + "pool_max_conns=10"
	}

	pool, err := pgxpool.New(context.Background(), connStr)
	if err != nil {
		log.Fatalf("db connection failed: %v", err)
	}
	defer pool.Close()

	// Repositories
	borrowerRepo := repository.NewBorrowerRepo(pool)
	loanRepo := repository.NewLoansRepo(pool)
	treasuryRepo := repository.NewTreasuryRepo(pool)

	// Services
	priceSvc := services.NewPriceService(treasuryRepo)
	lightningSvc := services.NewLightningService()
	loanSvc := services.NewLoanService(loanRepo, borrowerRepo, treasuryRepo, priceSvc, lightningSvc)
	liquidationSvc := services.NewLiquidationService(loanRepo, treasuryRepo, priceSvc)

	// Handlers
	loansHandler := handlers.NewLoansHandler(loanSvc, liquidationSvc, lightningSvc)
	dashboardHandler := handlers.NewDashboardHandler(treasuryRepo, priceSvc)
	healthHandler := handlers.NewHealthHandler(priceSvc, lightningSvc)
	collateralHandler := handlers.NewCollateralHandler()

	// Router
	r := gin.Default()
	r.SetTrustedProxies(nil)

	// Public API
	apiV1 := r.Group("/api/v1")
	{
		apiV1.POST("/loans", middleware.RateLimitLoanCreation(), loansHandler.OpenLoan)
		apiV1.GET("/loans/:id/status", loansHandler.GetLoanStatus)
		apiV1.POST("/loans/:id/repay", loansHandler.InitiateRepay)
		apiV1.POST("/loans/:id/repay/confirm", loansHandler.ConfirmRepay)
		apiV1.GET("/loans/:id/collateral/confirm", loansHandler.CheckCollateral)
		apiV1.POST("/loans/:id/collateral/confirm", loansHandler.CheckCollateral)
		apiV1.POST("/loans/:id/collateral", collateralHandler.AddCollateral)
	}

	// Health
	r.GET("/health", healthHandler.Health)
	r.GET("/ready", healthHandler.Readiness)

	// Dashboard (admin, needs auth)
	admin := r.Group("/api/v1/dashboard")
	admin.Use(middleware.AuthMiddleware())
	{
		admin.GET("/summary", dashboardHandler.Summary)
		admin.GET("/loans", dashboardHandler.Loans)
	}

	// Background schedulers
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	scheduler.StartLTVMonitor(ctx, liquidationSvc)
	scheduler.StartInterestAccrual(ctx, loanRepo, treasuryRepo, priceSvc)
	scheduler.StartPriceUpdater(ctx, priceSvc)

	// Server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	go func() {
		log.Printf("server starting on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down server...")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}
	log.Println("server exited")
}
