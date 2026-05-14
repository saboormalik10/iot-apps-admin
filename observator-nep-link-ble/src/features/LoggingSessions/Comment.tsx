import React, { useCallback } from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import IonIcon from '@react-native-vector-icons/ionicons';

interface CommentProps {
  comment: string;
  commentEditOnPressHandler: () => void;
}

const Comment: React.FC<CommentProps> = ({ comment, commentEditOnPressHandler }) => {
  const renderCommentLines = useCallback((text: string) => {
    return (text || '').split('\n').map((line, index) => (
      <Text key={index.toString()} style={styles.commentLine}>
        {line || ' '}
      </Text>
    ));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Comment</Text>
      <TouchableOpacity onPress={commentEditOnPressHandler} activeOpacity={0.7}>
        <View style={styles.contentContainer}>
          <View style={styles.textContainer}>
            {renderCommentLines(comment)}
          </View>
          <View style={styles.iconContainer}>
            <IonIcon
              name="create-outline"
              color="#000"
              size={24}
            />
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 10,
    margin: 20,
    flex: 1,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 5,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  contentContainer: {
    padding: 0,
    marginTop: 6,
    flex: 1,
    flexDirection: 'row',
  },
  textContainer: {
    flex: 1,
  },
  commentLine: {
    fontSize: 14,
    color: '#000',
  },
  iconContainer: {
    padding: 2,
    paddingLeft: 10,
  },
});

export default Comment;
