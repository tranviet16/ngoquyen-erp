# Performance runbook

Load runs use only synthetic data and P0/P1 endpoints. Local/disposable targets are allowed by default. A non-local target requires an approved change window, on-call owner, rate cap, stop condition, and `ALLOW_PRODUCTION_LOAD=yes`.

Record three to five runs with environment, seed, version, median latency, error rate, throughput and DB/host saturation. Performance is informational in PR CI, but every warning in scope needs an owner, RCA, remediation and re-measurement before closure.
