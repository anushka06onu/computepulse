.PHONY: eval eval-report anomaly horizon train-ai faithfulness dev

eval:
	python scripts/run_eval_suite.py

eval-report:
	python scripts/eval_report.py

anomaly:
	python train_anomaly.py

horizon:
	python train_horizon.py

train-ai: anomaly horizon eval-report
	python -c "print('AI artifacts ready')"

faithfulness:
	python scripts/faithfulness_explain.py

dev:
	bash scripts/dev.sh
