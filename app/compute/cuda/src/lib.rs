use pyo3::prelude::*;

#[pyfunction]
fn vector_sum(values: Vec<f64>) -> PyResult<f64> {
    #[cfg(feature = "cuda")]
    {
        if let Ok(sum) = cuda_sum(&values) {
            return Ok(sum);
        }
    }
    Ok(values.into_iter().sum())
}

#[cfg(feature = "cuda")]
fn cuda_sum(values: &[f64]) -> Result<f64, String> {
    use cudarc::driver::{CudaDevice, LaunchAsync};
    use cudarc::nvrtc::compile_ptx;

    let dev = CudaDevice::new(0).map_err(|e| e.to_string())?;

    let kernel = r#"
    extern "C" __global__ void sum_kernel(const float* input, int n, float* out) {
        __shared__ float sdata[256];
        unsigned int tid = threadIdx.x;
        unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;
        float x = (i < n) ? input[i] : 0.0f;
        sdata[tid] = x;
        __syncthreads();
        for (unsigned int s = blockDim.x / 2; s > 0; s >>= 1) {
            if (tid < s) {
                sdata[tid] += sdata[tid + s];
            }
            __syncthreads();
        }
        if (tid == 0) {
            atomicAdd(out, sdata[0]);
        }
    }
    "#;

    let ptx = compile_ptx(kernel, "sum.cu", &[]).map_err(|e| e.to_string())?;
    dev.load_ptx(ptx, "sum", &["sum_kernel"]).map_err(|e| e.to_string())?;
    let func = dev.get_func("sum", "sum_kernel").map_err(|e| e.to_string())?;

    let input: Vec<f32> = values.iter().map(|v| *v as f32).collect();
    let n = input.len() as i32;
    if n == 0 {
        return Ok(0.0);
    }

    let d_in = dev.htod_copy(input).map_err(|e| e.to_string())?;
    let mut d_out = dev.alloc_zeros::<f32>(1).map_err(|e| e.to_string())?;

    let threads = 256u32;
    let blocks = ((n as u32) + threads - 1) / threads;

    unsafe {
        func.launch((blocks, 1, 1), (threads, 1, 1), 0, (&d_in, n, &mut d_out))
            .map_err(|e| e.to_string())?;
    }

    let out = dev.dtoh_sync_copy(&d_out).map_err(|e| e.to_string())?;
    Ok(out[0] as f64)
}

#[pymodule]
fn mission_planner_cuda(_py: Python<'_>, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(vector_sum, m)?)?;
    Ok(())
}
