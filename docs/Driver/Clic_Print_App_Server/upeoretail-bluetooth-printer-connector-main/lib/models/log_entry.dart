class LogEntry {
  final int? id;
  final String timestamp;
  final String level; // INFO, WARN, ERROR, SUCCESS
  final String category; // BLUETOOTH, PRINT, JS_BRIDGE, INTENT, PERMISSION
  final String message;
  final String? details;

  LogEntry({
    this.id,
    required this.timestamp,
    required this.level,
    required this.category,
    required this.message,
    this.details,
  });

  Map<String, dynamic> toMap() {
    return {
      if (id != null) 'id': id,
      'timestamp': timestamp,
      'level': level,
      'category': category,
      'message': message,
      'details': details,
    };
  }

  factory LogEntry.fromMap(Map<String, dynamic> map) {
    return LogEntry(
      id: map['id'] as int?,
      timestamp: map['timestamp'] as String,
      level: map['level'] as String,
      category: map['category'] as String,
      message: map['message'] as String,
      details: map['details'] as String?,
    );
  }
}
