# Run analysis.mac using Maxima


TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_DIR="logs"
mkdir -p "$LOG_DIR"

run_maxima() {
     local mac_file="$1"
     local base_name="${mac_file%.mac}"
     local log_file="${LOG_DIR}/${base_name}_${TIMESTAMP}.log"
     echo "Running ${mac_file}, logging to ${log_file}..."
     maxima --very-quiet --batch-string="batchload(\"${mac_file}\")$" \
      | grep -v 'rat: replaced' --line-buffered \
      | grep -v '^$' --line-buffered \
      | tee "${log_file}"
}

run_maxima "smoke_test.mac"
#run_maxima "analysis.mac"
run_maxima "experiment.mac"
#run_maxima "sweep_ngon.mac"
run_maxima "pinwheels.mac"
run_maxima "erdos.mac"
