// Benchmark file: intentionally bad TypeScript code
// Expected smells: ComplexMethod, DeepNesting, MagicNumber, LargeMethod, LowDocCoverage

export function processOrder(order: any, user: any, config: any) {
  let total = 0;
  let discount = 0;
  let tax = 0;
  let shipping = 0;
  let valid = false;

  if (order !== null && order !== undefined) {
    if (user !== null && user !== undefined) {
      if (user.age >= 18) {
        if (order.items && order.items.length > 0) {
          for (let i = 0; i < order.items.length; i++) {
            const item = order.items[i];
            if (item.price > 0) {
              if (item.quantity > 0) {
                total += item.price * item.quantity;
                if (item.category === 'electronics') {
                  if (item.price > 500) {
                    discount += item.price * 0.15;
                  } else if (item.price > 200) {
                    discount += item.price * 0.08;
                  } else {
                    discount += item.price * 0.03;
                  }
                } else if (item.category === 'clothing') {
                  if (item.quantity > 3) {
                    discount += item.price * item.quantity * 0.20;
                  } else {
                    discount += item.price * 0.05;
                  }
                } else if (item.category === 'food') {
                  if (config.taxExempt) {
                    tax += 0;
                  } else {
                    tax += item.price * item.quantity * 0.06;
                  }
                }
              }
            }
          }
          if (total > 1000) {
            shipping = 0;
          } else if (total > 500) {
            shipping = 9.99;
          } else if (total > 100) {
            shipping = 19.99;
          } else {
            shipping = 29.99;
          }
          valid = true;
        }
      }
    }
  }

  const finalTotal = total - discount + tax + shipping;
  const roundedTotal = Math.round(finalTotal * 100) / 100;

  if (roundedTotal < 0) {
    return { error: 'Invalid total', code: 400 };
  }

  return {
    subtotal: total,
    discount: discount,
    tax: tax,
    shipping: shipping,
    total: roundedTotal,
    valid: valid,
  };
}

export function validateUserProfile(userData: any) {
  const errors: string[] = [];

  if (!userData.email || userData.email.length === 0) {
    errors.push('Email is required');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      errors.push('Invalid email format');
    }
    if (userData.email.length > 254) {
      errors.push('Email too long');
    }
  }

  if (!userData.password || userData.password.length < 8) {
    errors.push('Password must be at least 8 characters');
  } else {
    let hasUpper = false;
    let hasLower = false;
    let hasNumber = false;
    let hasSpecial = false;
    for (let c = 0; c < userData.password.length; c++) {
      const ch = userData.password[c];
      if (ch >= 'A' && ch <= 'Z') hasUpper = true;
      if (ch >= 'a' && ch <= 'z') hasLower = true;
      if (ch >= '0' && ch <= '9') hasNumber = true;
      if ('!@#$%^&*()'.includes(ch)) hasSpecial = true;
    }
    if (!hasUpper) errors.push('Password must contain uppercase');
    if (!hasLower) errors.push('Password must contain lowercase');
    if (!hasNumber) errors.push('Password must contain a number');
    if (!hasSpecial) errors.push('Password must contain a special character');
  }

  if (!userData.name || userData.name.length < 2) {
    errors.push('Name must be at least 2 characters');
  } else if (userData.name.length > 100) {
    errors.push('Name too long');
  }

  if (userData.age !== undefined) {
    if (typeof userData.age !== 'number') {
      errors.push('Age must be a number');
    } else if (userData.age < 0 || userData.age > 150) {
      errors.push('Age must be between 0 and 150');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function generateReport(data: any[], type: string, options: any) {
  let output = '';
  const timestamp = new Date().toISOString();

  if (type === 'summary') {
    output += `Report generated: ${timestamp}\n`;
    output += `Total records: ${data.length}\n`;
    let sum = 0;
    let min = Number.MAX_VALUE;
    let max = Number.MIN_VALUE;
    for (const row of data) {
      if (row.value !== undefined) {
        sum += row.value;
        if (row.value < min) min = row.value;
        if (row.value > max) max = row.value;
      }
    }
    const avg = data.length > 0 ? sum / data.length : 0;
    output += `Sum: ${sum}\nMin: ${min}\nMax: ${max}\nAvg: ${avg.toFixed(2)}\n`;
  } else if (type === 'detailed') {
    output += `Detailed Report — ${timestamp}\n`;
    output += '='.repeat(40) + '\n';
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      output += `[${i + 1}] `;
      if (row.id) output += `ID: ${row.id} `;
      if (row.name) output += `Name: ${row.name} `;
      if (row.value !== undefined) output += `Value: ${row.value} `;
      if (row.status) {
        if (row.status === 'active') output += '[ACTIVE]';
        else if (row.status === 'inactive') output += '[INACTIVE]';
        else if (row.status === 'pending') output += '[PENDING]';
        else output += `[${row.status.toUpperCase()}]`;
      }
      output += '\n';
    }
  } else if (type === 'csv') {
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      output += headers.join(',') + '\n';
      for (const row of data) {
        const values = headers.map(h => {
          const v = row[h];
          if (v === null || v === undefined) return '';
          if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
          return String(v);
        });
        output += values.join(',') + '\n';
      }
    }
  }

  if (options && options.footer) {
    output += '\n--- End of Report ---\n';
  }

  return output;
}
