.PHONY: eval eval-report anomaly horizon train-ai faithfulness dev api

BACKEND=backend

eval:
	cd $(BACKEND) && python scripts/run_eval_suite.py

eval-report:
	cd $(BACKEND) && python scripts/eval_report.py

anomaly:
	cd $(BACKEND) && python train_anomaly.py

horizon:
	cd $(BACKEND) && python train_horizon.py

train-ai: anomaly horizon eval-report
	python -c "print('AI artifacts ready')"

faithfulness:
	cd $(BACKEND) && python scripts/faithfulness_explain.py

api:
	cd $(BACKEND) && uvicorn api.main:app --reload --host 127.0.0.1 --port 8000

dev:
	bash scripts/dev.sh
